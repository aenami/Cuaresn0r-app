// Herramienta de operación; nunca se carga en la API ni usa secretos del frontend.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const dotenv = require('dotenv');
const {
  BackupError,
  encryptionKey,
  databaseUrl,
  createBackup,
  restoreTest,
  restoreNew,
  assertRecoveryTarget,
  assertArchiveKeyId,
  decryptArchive,
  removeWorkdir,
} = require('./backup/core.cjs');
const {
  storageConfig,
  uploadAndVerify,
  publishSuccess,
  downloadBackup,
  latestStatus,
} = require('./backup/storage.cjs');

const HELP = `Respaldo cifrado, R2/S3 y recuperación PostgreSQL de CorePOS

Desde server/:
  pnpm backup:postgres keygen
  pnpm backup:postgres backup --env-file <ARCHIVO_PRIVADO> [--upload-s3] [--restore-test]
  pnpm backup:postgres restore-test --env-file <ARCHIVO_PRIVADO> --file <RESPALDO.posbackup>
  pnpm backup:postgres status --env-file <ARCHIVO_PRIVADO> [--max-age-hours 30]
  pnpm backup:postgres download --env-file <ARCHIVO_PRIVADO> [--key <OBJETO.posbackup>]
  pnpm backup:postgres restore-new --env-file <ARCHIVO_PRIVADO> --file <RESPALDO.posbackup> --database <pos_recovered_NOMBRE> --confirm <pos_recovered_NOMBRE>

Las conexiones y claves solo se aceptan por variables de entorno/archivo privado.
BACKUP_DATABASE_URL es explícita: no se toma DATABASE_URL ni server/.env automáticamente.
restore-test crea una base temporal LOCAL y la elimina al terminar.
restore-new usa RESTORE_ADMIN_URL explícita y CONSERVA una base NUEVA verificada.
No se restauran bases existentes ni se cambia la conexión de producción.
download verifica tamaño/SHA-256 y autentica el cifrado; sin --key usa latest-success.
status comprueba indicador + HEAD, NO vuelve a restaurar; sale con error si está vencido.
`;

function parseArgs(args) {
  if (args.length === 0 || args.includes('--help')) return { command: 'help' };
  const command = args[0];
  const allowed = {
    keygen: [],
    backup: ['--env-file', '--upload-s3', '--restore-test'],
    'restore-test': ['--env-file', '--file'],
    'restore-new': ['--env-file', '--file', '--database', '--confirm'],
    download: ['--env-file', '--key'],
    status: ['--env-file', '--max-age-hours'],
  };
  if (!Object.hasOwn(allowed, command))
    throw new BackupError('Comando desconocido. Consulta --help.');
  const options = { command };
  for (let i = 1; i < args.length; i++) {
    const name = args[i];
    if (!allowed[command].includes(name) || options[name] !== undefined)
      throw new BackupError('Opción desconocida o repetida. Consulta --help.');
    if (['--upload-s3', '--restore-test'].includes(name)) options[name] = true;
    else {
      const value = args[++i];
      if (!value || value.startsWith('--'))
        throw new BackupError('Falta el valor de una opción.');
      options[name] = value;
    }
  }
  if (['restore-test', 'restore-new'].includes(command) && !options['--file'])
    throw new BackupError('La restauración necesita --file.');
  if (
    command === 'restore-new' &&
    (!options['--database'] || !options['--confirm'])
  )
    throw new BackupError(
      'restore-new necesita --database y --confirm explícitos.',
    );
  return options;
}

async function writeReport(dir, receipt, { complete = false } = {}) {
  const suffix = receipt.status === 'failed' ? '.failed' : '';
  const output = path.join(dir, `${receipt.id}${suffix}.report.json`);
  await fs.writeFile(output, JSON.stringify(receipt, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
  if (complete) {
    const temporary = path.join(
      dir,
      `latest-success-${crypto.randomBytes(6).toString('hex')}.json`,
    );
    await fs.writeFile(temporary, JSON.stringify(receipt, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
    await fs.rename(temporary, path.join(dir, 'latest-success.json'));
  }
  return output;
}

async function main(args, env = process.env) {
  const options = parseArgs(args);
  if (options.command === 'help') {
    process.stdout.write(HELP);
    return;
  }
  if (options.command === 'keygen') {
    // Solo al ejecutarlo expresamente. Nunca se imprime durante backup o pruebas.
    process.stdout.write(crypto.randomBytes(32).toString('base64') + '\n');
    return;
  }
  if (options['--env-file']) {
    const loaded = dotenv.config({
      path: path.resolve(options['--env-file']),
      quiet: true,
      processEnv: env,
    });
    if (loaded.error)
      throw new BackupError(
        'No se pudo leer el archivo privado de configuración.',
      );
  }
  if (options.command === 'status') {
    const result = await latestStatus(
      env,
      options['--max-age-hours'] === undefined
        ? 30
        : Number(options['--max-age-hours']),
    );
    process.stdout.write(JSON.stringify(result) + '\n');
    if (result.status !== 'ok')
      throw new BackupError(
        'El último respaldo está vencido. Revisa el job y realiza una copia verificada.',
      );
    return result;
  }
  const key = encryptionKey(env.BACKUP_ENCRYPTION_KEY);
  if (
    !env.BACKUP_DIR ||
    path.resolve(env.BACKUP_DIR) ===
      path.parse(path.resolve(env.BACKUP_DIR)).root
  )
    throw new BackupError(
      'Indica BACKUP_DIR como una carpeta privada de respaldos, no una raíz de disco.',
    );
  const dir = path.resolve(env.BACKUP_DIR);
  // Validar ANTES de respaldar o subir: no descubrir al final que la prueba era remota.
  const testing =
    options.command === 'restore-test' || options['--restore-test'];
  if (testing) databaseUrl(env.RESTORE_TEST_ADMIN_URL, { localOnly: true });
  if (options.command === 'restore-new')
    assertRecoveryTarget(
      env.RESTORE_ADMIN_URL,
      options['--database'],
      options['--confirm'],
    );
  if (options['--upload-s3'] || options.command === 'download')
    storageConfig(env);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  if (options.command === 'download') {
    const result = await downloadBackup(env, dir, options['--key']);
    const workdir = await fs.mkdtemp(path.join(dir, '.restore-work-'));
    try {
      const { manifest } = await decryptArchive(result.archive, key, workdir);
      assertArchiveKeyId(manifest, env);
      Object.assign(result, {
        backupId: manifest.id,
        backupCreatedAt: manifest.createdAt,
        keyId: manifest.keyId,
        cipherVerified: true,
      });
      const report = path.join(
        dir,
        `${manifest.id}.download-${Date.now()}.json`,
      );
      await fs.writeFile(report, JSON.stringify(result, null, 2) + '\n', {
        flag: 'wx',
        mode: 0o600,
      });
      process.stdout.write(JSON.stringify({ ...result, report }) + '\n');
      return result;
    } finally {
      await removeWorkdir(workdir);
    }
  }
  if (options.command === 'restore-new') {
    const workdir = await fs.mkdtemp(path.join(dir, '.restore-work-'));
    const report = path.join(
      dir,
      `${options['--database']}.recovery-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.json`,
    );
    try {
      const result = await restoreNew(
        path.resolve(options['--file']),
        key,
        env,
        workdir,
        options['--database'],
        options['--confirm'],
      );
      await fs.writeFile(report, JSON.stringify(result, null, 2) + '\n', {
        flag: 'wx',
        mode: 0o600,
      });
      process.stdout.write(JSON.stringify({ ...result, report }) + '\n');
      return result;
    } catch (error) {
      await fs.writeFile(
        report,
        JSON.stringify(
          {
            ...(error.recovery || {
              database: options['--database'],
              ok: false,
            }),
            status: 'failed',
            productionConnectionChanged: false,
          },
          null,
          2,
        ) + '\n',
        { flag: 'wx', mode: 0o600 },
      );
      throw error;
    } finally {
      await removeWorkdir(workdir);
    }
  }
  if (options.command === 'restore-test') {
    const workdir = await fs.mkdtemp(path.join(dir, '.restore-work-'));
    try {
      const result = await restoreTest(
        path.resolve(options['--file']),
        key,
        env.RESTORE_TEST_ADMIN_URL,
        env,
        workdir,
      );
      const report = path.join(
        dir,
        `${result.backupId}.restore-${Date.now()}.json`,
      );
      await fs.writeFile(report, JSON.stringify(result, null, 2) + '\n', {
        flag: 'wx',
        mode: 0o600,
      });
      process.stdout.write(JSON.stringify({ ...result, report }) + '\n');
      return result;
    } finally {
      await removeWorkdir(workdir);
    }
  }
  const backup = await createBackup(env, dir);
  try {
    let verifiedArchive = backup.archive;
    if (options['--upload-s3']) {
      const external = await uploadAndVerify(
        backup.archive,
        backup.receipt,
        env,
        backup.workdir,
      );
      verifiedArchive = external.downloaded;
      Object.assign(backup.receipt, external.storage);
    }
    if (testing)
      backup.receipt.restoreTest = await restoreTest(
        verifiedArchive,
        key,
        env.RESTORE_TEST_ADMIN_URL,
        env,
        backup.workdir,
      );
    backup.receipt.status = 'ok';
    const complete =
      backup.receipt.externalVerified && backup.receipt.restoreTest?.ok;
    if (complete)
      backup.receipt.successMarker = await publishSuccess(backup.receipt, env);
    const report = await writeReport(dir, backup.receipt, { complete });
    process.stdout.write(
      JSON.stringify({ ...backup.receipt, archive: backup.archive, report }) +
        '\n',
    );
    return backup.receipt;
  } catch (error) {
    backup.receipt.status = 'failed';
    await writeReport(dir, backup.receipt);
    throw error;
  } finally {
    await removeWorkdir(backup.workdir);
  }
}

if (require.main === module)
  main(process.argv.slice(2)).catch((error) => {
    console.error(
      error instanceof BackupError
        ? error.message
        : 'Falló la operación de respaldo. No se publican datos de conexión en la consola.',
    );
    process.exitCode = 1;
  });

module.exports = { parseArgs, main };
