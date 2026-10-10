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
  removeWorkdir,
} = require('./backup/core.cjs');
const {
  storageConfig,
  uploadAndVerify,
  publishSuccess,
} = require('./backup/storage.cjs');

const HELP = `Respaldo cifrado y restauración aislada de CorePOS

Desde server/:
  pnpm backup:postgres keygen
  pnpm backup:postgres backup --env-file <ARCHIVO_PRIVADO> [--upload-s3] [--restore-test]
  pnpm backup:postgres restore-test --env-file <ARCHIVO_PRIVADO> --file <RESPALDO.posbackup>

Las conexiones y claves solo se aceptan por variables de entorno/archivo privado.
BACKUP_DATABASE_URL es explícita: no se toma DATABASE_URL ni server/.env automáticamente.
La restauración solo crea una base temporal local nueva y la elimina al terminar.
No se restauran bases existentes ni se borra información operativa.
`;

function parseArgs(args) {
  if (args.length === 0 || args.includes('--help')) return { command: 'help' };
  const command = args[0];
  if (!['keygen', 'backup', 'restore-test'].includes(command))
    throw new BackupError('Comando desconocido. Consulta --help.');
  const options = { command };
  for (let i = 1; i < args.length; i++) {
    const name = args[i];
    if (
      !['--env-file', '--file', '--upload-s3', '--restore-test'].includes(
        name,
      ) ||
      options[name] !== undefined
    )
      throw new BackupError('Opción desconocida o repetida. Consulta --help.');
    if (['--upload-s3', '--restore-test'].includes(name)) options[name] = true;
    else {
      const value = args[++i];
      if (!value || value.startsWith('--'))
        throw new BackupError('Falta el valor de una opción.');
      options[name] = value;
    }
  }
  if (command === 'keygen' && args.length !== 1)
    throw new BackupError('keygen no recibe opciones.');
  if (command === 'backup' && options['--file'])
    throw new BackupError('--file solo se usa en restore-test.');
  if (
    command === 'restore-test' &&
    (!options['--file'] || options['--upload-s3'] || options['--restore-test'])
  )
    throw new BackupError(
      'restore-test necesita --file y no admite opciones de backup.',
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
  if (options['--upload-s3']) storageConfig(env);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
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
