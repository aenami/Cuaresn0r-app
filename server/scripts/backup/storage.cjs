const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} = require('@aws-sdk/client-s3');
const { BackupError, hashFile } = require('./core.cjs');

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
    if (receipt.bytes > 5_000_000_000)
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

module.exports = { storageConfig, uploadAndVerify, publishSuccess };
