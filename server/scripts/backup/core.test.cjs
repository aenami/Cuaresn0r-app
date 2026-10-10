const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const {
  encryptionKey,
  databaseUrl,
  connectionEnv,
  hashFile,
  encryptArchive,
  decryptArchive,
  checkRestored,
  canonicalConstraintDefinition,
  assertOwnedTestDatabase,
  removeWorkdir,
} = require('./core.cjs');
const { parseArgs, main } = require('../postgres-backup.cjs');
const {
  storageConfig,
  uploadAndVerify,
  publishSuccess,
} = require('./storage.cjs');

async function fixture(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pos-backup-unit-'));
  try {
    await fn(dir);
  } finally {
    const resolved = await fs.realpath(dir);
    assert.equal(path.dirname(resolved), await fs.realpath(os.tmpdir()));
    assert.match(path.basename(resolved), /^pos-backup-unit-[A-Za-z0-9]+$/);
    await fs.rm(resolved, { recursive: true, force: true });
  }
}

const key = () => crypto.randomBytes(32);
const envStorage = () => ({
  BACKUP_S3_BUCKET: 'pos-test-private',
  BACKUP_S3_PREFIX: 'pos/testing',
  BACKUP_S3_ENDPOINT: 'https://test.r2.cloudflarestorage.com',
  BACKUP_S3_ACCESS_KEY_ID: 'dummy',
  BACKUP_S3_SECRET_ACCESS_KEY: 'not-real',
});

test('rechaza una clave vacía, nula, corta, predecible o Base64 inválido', () => {
  for (const value of [
    undefined,
    '',
    'clave',
    Buffer.alloc(32).toString('base64'),
    'a'.repeat(44),
  ])
    assert.throws(() => encryptionKey(value));
  const valid = key().toString('base64');
  assert.equal(encryptionKey(valid).toString('base64'), valid);
});

test('limpia schema y exige usuario, base, TLS remoto y conexión directa', () => {
  assert.equal(
    databaseUrl('postgresql://u:p@localhost/POS?schema=public').search,
    '',
  );
  for (const value of [
    undefined,
    'https://u:p@host/POS',
    'postgresql://localhost/POS',
    'postgresql://u:p@localhost/',
    'postgresql://u:p@host/POS',
    'postgresql://u:p@ep-test-pooler.neon.tech/db?sslmode=require',
    'postgresql://u:p@localhost/POS?host=remote',
    'postgresql://u:p@localhost/POS?options=bad',
    'postgresql://u:p@remote/db?sslmode=require&sslmode=disable',
  ])
    assert.throws(() => databaseUrl(value));
});

test('restauración de prueba rechaza cualquier destino remoto incluso si tiene TLS', () => {
  assert.throws(
    () =>
      databaseUrl('postgresql://u:p@ep-example.neon.tech/db?sslmode=require', {
        localOnly: true,
      }),
    /solo admite/,
  );
  databaseUrl('postgresql://u:p@127.0.0.1:5432/POS', { localOnly: true });
});

test('libpq recibe la contraseña por entorno, no como URL ni argumento', () => {
  const env = connectionEnv(
    databaseUrl('postgresql://u:p%40ss@127.0.0.1:5439/POS?schema=public'),
  );
  assert.equal(env.PGPASSWORD, 'p@ss');
  assert.equal(env.PGDATABASE, 'POS');
  assert.equal(env.PGPORT, '5439');
  assert.equal(env.BACKUP_ENCRYPTION_KEY, undefined);
});

test('solo admite nombres temporales propios para retirar una base de prueba', () => {
  const admin = new URL('postgresql://u:p@127.0.0.1/postgres');
  for (const name of [
    'POS',
    'postgres',
    'pos_restore_test_',
    'pos_restore_test_20261010000000_bad',
    'x; DROP DATABASE POS',
  ])
    assert.throws(() => assertOwnedTestDatabase(admin, name));
  assertOwnedTestDatabase(
    admin,
    'pos_restore_test_20261010000000_abcdef123456',
  );
});

test('no limpia carpetas generales ni archivos ajenos a la operación', async () =>
  fixture(async (dir) => {
    await assert.rejects(removeWorkdir(dir), /ruta/);
    const work = await fs.mkdtemp(path.join(dir, '.backup-work-'));
    await fs.writeFile(path.join(work, 'ajeno.txt'), 'no borrar');
    await assert.rejects(removeWorkdir(work));
    assert.equal(
      await fs.readFile(path.join(work, 'ajeno.txt'), 'utf8'),
      'no borrar',
    );
  }));

test('cifrado autentica manifiesto y bytes, y no expone el contenido', async () =>
  fixture(async (dir) => {
    const dump = path.join(dir, 'original.dump'),
      output = path.join(dir, 'test.posbackup'),
      secret = key();
    await fs.writeFile(dump, 'PGDMP datos PRIVADOS con cliente y nómina');
    const manifest = {
      format: 'corepos-postgres/v1',
      id: 'test',
      database: { data: [] },
      dumpSha256: await hashFile(dump),
    };
    const receipt = await encryptArchive(dump, manifest, secret, output);
    assert.equal(receipt.sha256, await hashFile(output));
    assert.equal(
      (await fs.readFile(output)).includes(Buffer.from('PRIVADOS')),
      false,
    );
    const work = await fs.mkdtemp(path.join(dir, '.restore-work-'));
    const result = await decryptArchive(output, secret, work);
    assert.deepEqual(result.manifest, manifest);
    assert.equal(await hashFile(result.dump), manifest.dumpSha256);
    await removeWorkdir(work);
  }));

for (const mutation of ['clave', 'datos', 'header', 'tag', 'truncado'])
  test(`rechaza ${mutation} incorrecto antes de restaurar`, async () =>
    fixture(async (dir) => {
      const dump = path.join(dir, 'original.dump'),
        output = path.join(dir, 'test.posbackup'),
        secret = key();
      await fs.writeFile(dump, crypto.randomBytes(4096));
      await encryptArchive(
        dump,
        {
          format: 'corepos-postgres/v1',
          id: 'test',
          database: { data: [] },
          dumpSha256: await hashFile(dump),
        },
        secret,
        output,
      );
      const bytes = await fs.readFile(output);
      if (mutation === 'datos') bytes[100] ^= 1;
      if (mutation === 'header') bytes[0] ^= 1;
      if (mutation === 'tag') bytes[bytes.length - 1] ^= 1;
      await fs.writeFile(
        output,
        mutation === 'truncado' ? bytes.subarray(0, 15) : bytes,
      );
      const work = await fs.mkdtemp(path.join(dir, '.restore-work-'));
      await assert.rejects(
        decryptArchive(output, mutation === 'clave' ? key() : secret, work),
      );
      await removeWorkdir(work);
    }));

test('no sobrescribe un respaldo ni borra un partial ajeno', async () =>
  fixture(async (dir) => {
    const dump = path.join(dir, 'original.dump'),
      output = path.join(dir, 'test.posbackup');
    await fs.writeFile(dump, 'PGDMP');
    await fs.writeFile(output, 'anterior');
    await fs.writeFile(output + '.partial', 'ajeno');
    await assert.rejects(encryptArchive(dump, {}, key(), output));
    assert.equal(await fs.readFile(output, 'utf8'), 'anterior');
    assert.equal(await fs.readFile(output + '.partial', 'utf8'), 'ajeno');
  }));

test('detecta diferencias de esquema, cantidad y contenido', () => {
  const original = {
    catalogHash: 'abc',
    data: [{ rows: '12', fingerprint: 'one' }],
    catalogCounts: {},
  };
  assert.equal(checkRestored(original, original).rows, '12');
  for (const changed of [
    { ...original, catalogHash: 'other' },
    { ...original, data: [{ rows: '11', fingerprint: 'one' }] },
    { ...original, data: [{ rows: '12', fingerprint: 'two' }] },
  ])
    assert.throws(() => checkRestored(original, changed));
});

test('CHECK normaliza solo las coerciones equivalentes de ARRAY literal varchar a text', () => {
  const source =
    "CHECK (((grupo)::text = ANY ((ARRAY['CALDO'::character varying, 'PRINCIPIO'::character varying])::text[])))";
  const restored =
    "CHECK (((grupo)::text = ANY (ARRAY[('CALDO'::character varying)::text, ('PRINCIPIO'::character varying)::text])))";
  assert.equal(canonicalConstraintDefinition(source), restored);
  assert.notEqual(
    canonicalConstraintDefinition(source.replace('CALDO', 'OTRO')),
    restored,
  );
  assert.notEqual(
    canonicalConstraintDefinition(source.replace('= ANY', '<> ALL')),
    restored,
  );
  const numeric = 'CHECK ((importe = ANY ((ARRAY[1, 2])::numeric[])))';
  assert.equal(canonicalConstraintDefinition(numeric), numeric);
});

test('manifiesto autenticado con identificador de ruta inseguro también se rechaza', async () =>
  fixture(async (dir) => {
    const dump = path.join(dir, 'original.dump'),
      output = path.join(dir, 'test.posbackup'),
      secret = key();
    await fs.writeFile(dump, 'PGDMP');
    await encryptArchive(
      dump,
      {
        format: 'corepos-postgres/v1',
        id: '../fuera',
        database: { data: [] },
        dumpSha256: await hashFile(dump),
      },
      secret,
      output,
    );
    const work = await fs.mkdtemp(path.join(dir, '.restore-work-'));
    await assert.rejects(decryptArchive(output, secret, work), /manifiesto/);
    await removeWorkdir(work);
  }));

test('CLI rechaza opciones repetidas, secretos como argumentos y destinos ambiguos', () => {
  assert.deepEqual(parseArgs(['backup', '--upload-s3', '--restore-test']), {
    command: 'backup',
    '--upload-s3': true,
    '--restore-test': true,
  });
  for (const args of [
    ['restore-test'],
    ['backup', '--file', 'a'],
    ['backup', '--database-url', 'secret'],
    ['backup', '--upload-s3', '--upload-s3'],
    ['keygen', '--env-file', 'a'],
    ['backup', '--env-file'],
  ])
    assert.throws(() => parseArgs(args));
});

test('CLI valida restauración remota antes de conectar, crear o subir', async () => {
  await assert.rejects(
    main(['backup', '--restore-test'], {
      BACKUP_ENCRYPTION_KEY: key().toString('base64'),
      BACKUP_DIR: os.tmpdir(),
      RESTORE_TEST_ADMIN_URL: 'postgresql://u:p@remote/db?sslmode=require',
    }),
    /solo admite/,
  );
});

test('S3 exige endpoint HTTPS, bucket, prefijo y credenciales explícitas', () => {
  storageConfig(envStorage());
  for (const changed of [
    { BACKUP_S3_ENDPOINT: 'http://test' },
    { BACKUP_S3_ENDPOINT: 'https://u:p@host' },
    { BACKUP_S3_BUCKET: '' },
    { BACKUP_S3_PREFIX: '../other' },
    { BACKUP_S3_SECRET_ACCESS_KEY: '' },
  ])
    assert.throws(() => storageConfig({ ...envStorage(), ...changed }));
});

test('subida externa solo pasa tras descargar y verificar todos los bytes', async () =>
  fixture(async (dir) => {
    const archive = path.join(dir, 'test.posbackup'),
      data = crypto.randomBytes(5000);
    await fs.writeFile(archive, data);
    const receipt = {
      createdAt: '2026-10-10T00:00:00Z',
      bytes: data.length,
      sha256: await hashFile(archive),
    };
    const names = [];
    const client = {
      send: async (command) => {
        names.push(command.constructor.name);
        if (names.length === 1) {
          for await (const ignored of command.input.Body)
            assert(ignored.length);
          return {};
        }
        if (names.length === 2)
          return {
            ContentLength: data.length,
            Metadata: { sha256: receipt.sha256 },
          };
        return { Body: Readable.from([data]) };
      },
    };
    const result = await uploadAndVerify(
      archive,
      receipt,
      envStorage(),
      dir,
      client,
    );
    assert.deepEqual(names, [
      'PutObjectCommand',
      'HeadObjectCommand',
      'GetObjectCommand',
    ]);
    assert.equal(result.storage.externalVerified, true);
    assert.equal(await hashFile(result.downloaded), receipt.sha256);
  }));

test('HEAD correcto con descarga alterada no se acepta como respaldo externo', async () =>
  fixture(async (dir) => {
    const archive = path.join(dir, 'test.posbackup');
    await fs.writeFile(archive, 'correcto');
    const receipt = {
      createdAt: '2026-10-10T00:00:00Z',
      bytes: 8,
      sha256: await hashFile(archive),
    };
    let call = 0;
    const client = {
      send: async (command) => {
        call++;
        if (call === 1) {
          for await (const ignored of command.input.Body)
            assert(ignored.length);
          return {};
        }
        if (call === 2)
          return { ContentLength: 8, Metadata: { sha256: receipt.sha256 } };
        return { Body: Readable.from([Buffer.from('alterado')]) };
      },
    };
    await assert.rejects(
      uploadAndVerify(archive, receipt, envStorage(), dir, client),
      /no coincide/,
    );
  }));

test('no publica éxito cuando la copia externa o restauración están pendientes', async () => {
  for (const receipt of [
    {},
    { externalVerified: true },
    { externalVerified: true, restoreTest: { ok: true } },
  ])
    await assert.rejects(
      publishSuccess(receipt, envStorage()),
      /No se publica/,
    );
});

test('publica y relee indicador de éxito sin credenciales ni datos de clientes', async () => {
  const receipt = {
    id: 'test',
    createdAt: '2026-10-10T00:00:00Z',
    keyId: 'key-1',
    key: 'pos/testing/test.posbackup',
    sha256: 'a'.repeat(64),
    bytes: 5000,
    externalVerified: true,
    restoreTest: { ok: true, testDatabaseRemoved: true },
  };
  let body;
  const client = {
    send: async (command) => {
      if (command.constructor.name === 'PutObjectCommand') {
        body = command.input.Body;
        return {};
      }
      return { Body: Readable.from([Buffer.from(body)]) };
    },
  };
  assert.equal(
    await publishSuccess(receipt, envStorage(), client),
    'pos/testing/latest-success.json',
  );
  assert.equal(JSON.parse(body).restoreVerified, true);
  assert(!body.includes('SECRET'));
});

test('indicador de éxito modificado al descargar falla', async () => {
  const client = {
    send: async () => ({ Body: Readable.from([Buffer.from('alterado')]) }),
  };
  await assert.rejects(
    publishSuccess(
      {
        externalVerified: true,
        restoreTest: { ok: true, testDatabaseRemoved: true },
      },
      envStorage(),
      client,
    ),
    /no coincide/,
  );
});
