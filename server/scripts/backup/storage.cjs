const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const { Transform, addAbortSignal } = require('node:stream');
const crypto = require('node:crypto');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} = require('@aws-sdk/client-s3');
const { BackupError, hashFile } = require('./core.cjs');

const MAX_ARCHIVE_BYTES = 5_000_000_000;

function archiveKey(key, prefix) {
  if (
    typeof key !== 'string' ||
    !key.startsWith(prefix + '/') ||
    !/^[a-zA-Z0-9/_.-]+$/.test(key) ||
    key
      .split('/')
      .some((part) => !part || part === '.' || part.includes('..')) ||
    !/^[a-zA-Z0-9_-][a-zA-Z0-9._-]{0,159}\.posbackup$/.test(
      path.posix.basename(key),
    )
  )
    throw new BackupError(
      'La clave del objeto debe identificar un .posbackup dentro de BACKUP_S3_PREFIX.',
    );
  return key;
}

function objectReceipt(head) {
  if (
    !Number.isSafeInteger(head.ContentLength) ||
    head.ContentLength < 40 ||
    head.ContentLength > MAX_ARCHIVE_BYTES ||
    !/^[a-f0-9]{64}$/.test(head.Metadata?.sha256 || '')
  )
    throw new BackupError(
      'El objeto no tiene tamaño/huella de respaldo válidos o supera 5 GB.',
    );
  return { bytes: head.ContentLength, sha256: head.Metadata.sha256 };
}

async function readSuccess(client, config, signal) {
  const result = await client.send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: `${config.prefix}/latest-success.json`,
    }),
    { abortSignal: signal },
  );
  if (!result.Body)
    throw new BackupError('Falta el indicador externo de éxito.');
  addAbortSignal(signal, result.Body);
  const chunks = [];
  let bytes = 0;
  let marker;
  try {
    for await (const chunk of result.Body) {
      bytes += Buffer.byteLength(chunk);
      if (bytes > 16384)
        throw new BackupError('Indicador externo demasiado grande.');
      chunks.push(Buffer.from(chunk));
    }
    marker = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new BackupError(
      'El indicador externo no es un JSON válido y acotado.',
    );
  } finally {
    result.Body.destroy?.();
  }
  if (
    !marker ||
    !/^[a-zA-Z0-9_-][a-zA-Z0-9._-]{0,159}$/.test(marker.id || '') ||
    marker.id.includes('..') ||
    !/^[a-zA-Z0-9-]{1,40}$/.test(marker.keyId || '') ||
    marker.externalVerified !== true ||
    marker.restoreVerified !== true ||
    !Number.isFinite(Date.parse(marker.createdAt)) ||
    !Number.isFinite(Date.parse(marker.verifiedAt)) ||
    Date.parse(marker.verifiedAt) < Date.parse(marker.createdAt)
  )
    throw new BackupError('El indicador no acredita una copia verificada.');
  archiveKey(marker.key, config.prefix);
  if (path.posix.basename(marker.key) !== `${marker.id}.posbackup`)
    throw new BackupError('El indicador apunta a un archivo diferente.');
  objectReceipt({
    ContentLength: marker.bytes,
    Metadata: { sha256: marker.sha256 },
  });
  // No devolver campos adicionales de un objeto externo sin validarlos.
  return Object.fromEntries(
    ['id', 'createdAt', 'verifiedAt', 'keyId', 'key', 'sha256', 'bytes'].map(
      (field) => [field, marker[field]],
    ),
  );
}

async function latestStatus(
  env,
  maxAgeHours = 30,
  injectedClient,
  now = Date.now(),
) {
  if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0 || maxAgeHours > 8760)
    throw new BackupError(
      '--max-age-hours debe estar entre 0 y 8760 horas, excluyendo 0.',
    );
  const config = storageConfig(env);
  const client = injectedClient || new S3Client(config.client);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const marker = await readSuccess(client, config, controller.signal);
    if (
      Date.parse(marker.createdAt) > now + 300000 ||
      Date.parse(marker.verifiedAt) > now + 300000
    )
      throw new BackupError(
        'El indicador tiene fechas futuras; revisa el reloj.',
      );
    const head = objectReceipt(
      await client.send(
        new HeadObjectCommand({ Bucket: config.bucket, Key: marker.key }),
        { abortSignal: controller.signal },
      ),
    );
    if (head.bytes !== marker.bytes || head.sha256 !== marker.sha256)
      throw new BackupError(
        'El indicador no coincide con el objeto almacenado.',
      );
    const ageHours = Math.max(
      0,
      (now - Date.parse(marker.createdAt)) / 3600000,
    );
    return {
      ...marker,
      status: ageHours > maxAgeHours ? 'stale' : 'ok',
      ageHours: Math.round(ageHours * 100) / 100,
      maxAgeHours,
      checkedAt: new Date(now).toISOString(),
      // HEAD + indicador no sustituyen una descarga y restauración nuevas.
      currentCheck: 'marker-and-head',
    };
  } catch (error) {
    if (error instanceof BackupError) throw error;
    throw new BackupError(
      'No se pudo consultar el último respaldo externo. Revisa permisos, conexión y existencia del objeto.',
    );
  } finally {
    clearTimeout(timeout);
    if (!injectedClient) client.destroy();
  }
}

async function downloadBackup(env, outputDir, requestedKey, injectedClient) {
  const config = storageConfig(env);
  if (requestedKey !== undefined) archiveKey(requestedKey, config.prefix);
  const client = injectedClient || new S3Client(config.client);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20 * 60 * 1000);
  let partial,
    ownedPartial = false,
    remoteBody;
  try {
    const marker = requestedKey
      ? undefined
      : await readSuccess(client, config, controller.signal);
    const key = requestedKey || marker.key;
    const receipt = objectReceipt(
      await client.send(
        new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
        { abortSignal: controller.signal },
      ),
    );
    if (
      marker &&
      (receipt.bytes !== marker.bytes || receipt.sha256 !== marker.sha256)
    )
      throw new BackupError('El último respaldo no coincide con su indicador.');
    await fsp.mkdir(outputDir, { recursive: true, mode: 0o700 });
    const archive = path.join(outputDir, path.posix.basename(key));
    partial = `${archive}.${crypto.randomBytes(6).toString('hex')}.partial`;
    const remote = await client.send(
      new GetObjectCommand({ Bucket: config.bucket, Key: key }),
      { abortSignal: controller.signal },
    );
    remoteBody = remote.Body;
    if (!remoteBody)
      throw new BackupError('El almacenamiento no devolvió el respaldo.');
    let received = 0;
    const limit = new Transform({
      transform(chunk, encoding, callback) {
        received += chunk.length;
        if (received > receipt.bytes)
          callback(new BackupError('La descarga supera el tamaño declarado.'));
        else callback(null, chunk);
      },
    });
    const destination = fs.createWriteStream(partial, {
      flags: 'wx',
      mode: 0o600,
    });
    destination.once('open', () => {
      ownedPartial = true;
    });
    await pipeline(remoteBody, limit, destination, {
      signal: controller.signal,
    });
    if (
      received !== receipt.bytes ||
      (await hashFile(partial)) !== receipt.sha256
    )
      throw new BackupError(
        'La descarga está incompleta o su huella no coincide.',
      );
    await fsp.copyFile(partial, archive, fs.constants.COPYFILE_EXCL);
    return {
      archive,
      key,
      ...receipt,
      downloadedAt: new Date().toISOString(),
      externalVerified: true,
    };
  } catch (error) {
    if (error instanceof BackupError) throw error;
    throw new BackupError(
      error.code === 'EEXIST'
        ? 'El archivo local ya existe. No se sobrescribió; usa otra carpeta privada.'
        : 'Falló la descarga del respaldo. Revisa permisos, conexión y clave del objeto.',
    );
  } finally {
    clearTimeout(timeout);
    remoteBody?.destroy?.();
    if (ownedPartial) await fsp.rm(partial, { force: true });
    if (!injectedClient) client.destroy();
  }
}

function storageConfig(env) {
  const bucket = env.BACKUP_S3_BUCKET,
    prefix = env.BACKUP_S3_PREFIX || 'pos';
  if (
    !bucket ||
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) ||
    bucket.includes('..')
  )
    throw new BackupError('Configura un bucket S3 privado válido.');
  if (
    !/^[a-zA-Z0-9/_-]{1,160}$/.test(prefix) ||
    prefix.startsWith('/') ||
    prefix.includes('..')
  )
    throw new BackupError('BACKUP_S3_PREFIX no es válido.');
  let endpoint;
  if (env.BACKUP_S3_ENDPOINT) {
    try {
      endpoint = new URL(env.BACKUP_S3_ENDPOINT);
    } catch {
      throw new BackupError('Endpoint S3 inválido.');
    }
    if (
      endpoint.protocol !== 'https:' ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash
    )
      throw new BackupError(
        'El endpoint externo debe usar HTTPS y no contener credenciales.',
      );
  }
  if (!env.BACKUP_S3_ACCESS_KEY_ID || !env.BACKUP_S3_SECRET_ACCESS_KEY)
    throw new BackupError(
      'Faltan las credenciales privadas del almacenamiento S3.',
    );
  return {
    bucket,
    prefix: prefix.replace(/\/$/, ''),
    client: {
      region: env.BACKUP_S3_REGION || 'auto',
      endpoint: endpoint?.toString(),
      credentials: {
        accessKeyId: env.BACKUP_S3_ACCESS_KEY_ID,
        secretAccessKey: env.BACKUP_S3_SECRET_ACCESS_KEY,
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      maxAttempts: 3,
    },
  };
}

async function uploadAndVerify(archive, receipt, env, workdir, injectedClient) {
  const config = storageConfig(env),
    client = injectedClient || new S3Client(config.client);
  const key = `${config.prefix}/${receipt.createdAt.slice(0, 10)}/${path.basename(archive)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20 * 60 * 1000);
  const downloaded = path.join(workdir, 'downloaded.posbackup');
  let uploadBody;
  try {
    if (receipt.bytes > MAX_ARCHIVE_BYTES)
      throw new BackupError(
        'El respaldo supera el límite de subida simple; configura multipart antes de continuar.',
      );
    uploadBody = fs.createReadStream(archive);
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: uploadBody,
        ContentLength: receipt.bytes,
        ContentType: 'application/octet-stream',
        Metadata: { sha256: receipt.sha256, format: 'corepos-postgres-v1' },
      }),
      { abortSignal: controller.signal },
    );
    const head = await client.send(
      new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
      { abortSignal: controller.signal },
    );
    if (
      head.ContentLength !== receipt.bytes ||
      head.Metadata?.sha256 !== receipt.sha256
    )
      throw new BackupError(
        'La verificación de tamaño/metadata externa falló.',
      );
    // HEAD no es suficiente: descargar otra vez y comprobar los bytes almacenados.
    const remote = await client.send(
      new GetObjectCommand({ Bucket: config.bucket, Key: key }),
      { abortSignal: controller.signal },
    );
    if (!remote.Body)
      throw new BackupError('El almacenamiento no devolvió el respaldo.');
    await pipeline(
      remote.Body,
      fs.createWriteStream(downloaded, { flags: 'wx', mode: 0o600 }),
      { signal: controller.signal },
    );
    if ((await hashFile(downloaded)) !== receipt.sha256)
      throw new BackupError(
        'La copia externa descargada no coincide con el respaldo.',
      );
    return {
      downloaded,
      storage: {
        key,
        bytes: receipt.bytes,
        sha256: receipt.sha256,
        externalVerified: true,
      },
    };
  } catch (error) {
    if (error instanceof BackupError) throw error;
    throw new BackupError(
      'Falló la subida o descarga externa. Revisa permisos, conexión y cuota; no se marcó como respaldo externo correcto.',
    );
  } finally {
    clearTimeout(timeout);
    uploadBody?.destroy();
    if (!injectedClient) client.destroy();
  }
}

async function publishSuccess(receipt, env, injectedClient) {
  if (
    !receipt.externalVerified ||
    !receipt.restoreTest?.ok ||
    !receipt.restoreTest.testDatabaseRemoved
  )
    throw new BackupError(
      'No se publica éxito sin copia externa verificada y restauración completa.',
    );
  const config = storageConfig(env),
    client = injectedClient || new S3Client(config.client);
  const key = `${config.prefix}/latest-success.json`;
  const body =
    JSON.stringify(
      {
        id: receipt.id,
        createdAt: receipt.createdAt,
        verifiedAt: new Date().toISOString(),
        keyId: receipt.keyId,
        key: receipt.key,
        sha256: receipt.sha256,
        bytes: receipt.bytes,
        externalVerified: true,
        restoreVerified: true,
      },
      null,
      2,
    ) + '\n';
  const controller = new AbortController(),
    timeout = setTimeout(() => controller.abort(), 60000);
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: body,
        ContentLength: Buffer.byteLength(body),
        ContentType: 'application/json',
        CacheControl: 'no-store',
      }),
      { abortSignal: controller.signal },
    );
    const result = await client.send(
      new GetObjectCommand({ Bucket: config.bucket, Key: key }),
      { abortSignal: controller.signal },
    );
    if (!result.Body)
      throw new BackupError('No se pudo leer el indicador externo de éxito.');
    let downloaded = '';
    for await (const chunk of result.Body) {
      downloaded += chunk.toString();
      if (downloaded.length > 65536)
        throw new BackupError('Indicador externo demasiado grande.');
    }
    if (downloaded !== body)
      throw new BackupError('El indicador externo de éxito no coincide.');
    return key;
  } catch (error) {
    if (error instanceof BackupError) throw error;
    throw new BackupError(
      'No se pudo publicar/verificar el indicador externo de éxito.',
    );
  } finally {
    clearTimeout(timeout);
    if (!injectedClient) client.destroy();
  }
}

module.exports = {
  storageConfig,
  uploadAndVerify,
  publishSuccess,
  latestStatus,
  downloadBackup,
};
