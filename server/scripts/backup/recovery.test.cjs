const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const {
  BackupError,
  assertRecoveryTarget,
  restoreNew,
  encryptArchive,
  hashFile,
  removeWorkdir,
  connectionEnv,
  databaseUrl,
} = require('./core.cjs');
const { downloadBackup, latestStatus } = require('./storage.cjs');
const { parseArgs, main } = require('../postgres-backup.cjs');

const storageEnv = {
  BACKUP_S3_BUCKET: 'pos-test-private',
  BACKUP_S3_PREFIX: 'pos/testing',
  BACKUP_S3_ENDPOINT: 'https://test.r2.cloudflarestorage.com',
  BACKUP_S3_ACCESS_KEY_ID: 'dummy',
  BACKUP_S3_SECRET_ACCESS_KEY: 'not-real',
};
const target = 'pos_recovered_unit_20261010';
const catalog = {
  data: [
    {
      schema: 'public',
      name: 'orders',
      kind: 'r',
      rows: '3',
      fingerprint: 'test',
    },
  ],
  catalogHash: 'unit',
  catalogCounts: { columns: 4 },
};

async function fixture(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pos-recovery-unit-'));
  try {
    return await fn(dir);
  } finally {
    const resolved = await fs.realpath(dir);
    assert.equal(path.dirname(resolved), await fs.realpath(os.tmpdir()));
    assert.match(path.basename(resolved), /^pos-recovery-unit-[A-Za-z0-9]+$/);
    await fs.rm(resolved, { recursive: true, force: true });
  }
}

async function archiveFixture(dir) {
  const key = crypto.randomBytes(32);
  const dump = path.join(dir, 'source.dump');
  const archive = path.join(dir, 'unit.posbackup');
  await fs.writeFile(dump, 'PGDMP fixture no contiene datos reales');
  await encryptArchive(
    dump,
    {
      format: 'corepos-postgres/v1',
      id: 'unit',
      keyId: 'unit-key',
      createdAt: '2026-10-10T08:00:00Z',
      sourceVersion: '17.4',
      dumpVersion: 'pg_dump (PostgreSQL) 17.4',
      database: catalog,
      dumpSha256: await hashFile(dump),
    },
    key,
    archive,
  );
  const work = await fs.mkdtemp(path.join(dir, '.restore-work-'));
  return {
    key,
    archive,
    work,
    env: {
      RESTORE_ADMIN_URL: 'postgresql://u:private-password@127.0.0.1/postgres',
      BACKUP_KEY_ID: 'unit-key',
    },
  };
}

function postgresStub(options = {}) {
  const queries = [],
    executions = [],
    connections = [];
  class Client {
    constructor(config) {
      connections.push(new URL(config.connectionString).pathname);
    }
    async connect() {}
    async end() {}
    async query(sql, values) {
      queries.push({ sql, values });
      if (sql.includes("current_setting('server_version')"))
        return { rows: [{ version: options.serverVersion || '17.4' }] };
      if (sql.startsWith('SELECT oid'))
        return { rows: options.exists ? [{ oid: 42 }] : [] };
      if (sql.startsWith('CREATE DATABASE') && options.race)
        throw new Error('42P04 already exists');
      return { rows: [] };
    }
  }
  return {
    queries,
    executions,
    connections,
    dependencies: {
      Client,
      runTool: async (binary, args, env) => {
        executions.push({ binary, args, env });
        if (args.includes('--version'))
          return {
            stdout: `pg_restore (PostgreSQL) ${options.toolVersion || '17.4'}`,
          };
        if (options.restoreError) throw options.restoreError;
        return { stdout: '', warnings: Boolean(options.restoreWarnings) };
      },
      describeDatabase: async () =>
        options.changed ? { ...catalog, data: [] } : catalog,
    },
  };
}

test('recuperación requiere destino nuevo acotado, confirmación exacta y TLS remoto', () => {
  const url = 'postgresql://u:p@localhost/postgres';
  for (const name of [
    'POS',
    'postgres',
    'pos_recovered_',
    'pos_recovered_x;DROP',
    'pos_recovered_' + 'a'.repeat(46),
  ])
    assert.throws(() => assertRecoveryTarget(url, name, name));
  assert.throws(() => assertRecoveryTarget(url, target, 'otro'), /confirm/);
  assert.throws(() =>
    assertRecoveryTarget(url.replace('postgres', target), target, target),
  );
  assert.throws(
    () =>
      assertRecoveryTarget('postgresql://u:p@remote/postgres', target, target),
    /TLS/,
  );
  assertRecoveryTarget(
    'postgresql://u:p@remote/postgres?sslmode=verify-full',
    target,
    target,
  );
});

test('CLI separa recuperación real, ensayo, descarga y consulta sin aceptar secretos', () => {
  assert.equal(parseArgs(['download']).command, 'download');
  assert.equal(
    parseArgs(['status', '--max-age-hours', '30']).command,
    'status',
  );
  assert.equal(
    parseArgs([
      'restore-new',
      '--file',
      'x',
      '--database',
      target,
      '--confirm',
      target,
    ]).command,
    'restore-new',
  );
  for (const args of [
    ['restore-new', '--file', 'x'],
    ['restore-new', '--file', 'x', '--database', target],
    ['restore-test', '--file', 'x', '--confirm', target],
    ['download', '--upload-s3'],
    ['status', '--restore-test'],
    ['download', '--encryption-key', 'secret'],
    [
      'restore-new',
      '--file',
      'x',
      '--database',
      target,
      '--confirm',
      target,
      '--clean',
    ],
  ])
    assert.throws(() => parseArgs(args));
});

test('CLI rechaza confirmación equivocada antes de crear carpetas o conectar', async () =>
  fixture(async (dir) => {
    await assert.rejects(
      main(
        [
          'restore-new',
          '--file',
          'missing',
          '--database',
          target,
          '--confirm',
          'otro',
        ],
        {
          BACKUP_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
          BACKUP_DIR: path.join(dir, 'no-created'),
          RESTORE_ADMIN_URL: 'postgresql://u:p@localhost/postgres',
        },
      ),
      /confirm/,
    );
    await assert.rejects(fs.stat(path.join(dir, 'no-created')), {
      code: 'ENOENT',
    });
  }));

for (const scenario of [
  'wrong-key',
  'wrong-key-id',
  'old-tool',
  'different-major',
  'exists',
  'race',
])
  test(`recuperación rechaza ${scenario} sin ejecutar el dump ni borrar bases`, async () =>
    fixture(async (dir) => {
      const data = await archiveFixture(dir);
      const stub = postgresStub({
        toolVersion: scenario === 'old-tool' ? '16.4' : '17.4',
        serverVersion: scenario === 'different-major' ? '18.0' : '17.4',
        exists: scenario === 'exists',
        race: scenario === 'race',
      });
      if (scenario === 'wrong-key-id') data.env.BACKUP_KEY_ID = 'other-key';
      await assert.rejects(
        restoreNew(
          data.archive,
          scenario === 'wrong-key' ? crypto.randomBytes(32) : data.key,
          data.env,
          data.work,
          target,
          target,
          stub.dependencies,
        ),
      );
      assert(stub.executions.every((call) => call.args.includes('--version')));
      assert(
        stub.queries.every((call) => !/DROP|DELETE|TRUNCATE/.test(call.sql)),
      );
      if (['wrong-key', 'wrong-key-id', 'old-tool'].includes(scenario))
        assert.equal(stub.connections.length, 0);
      await removeWorkdir(data.work);
    }));

test('recuperación conserva base verificada, no toca producción y no envía secretos como argumentos', async () =>
  fixture(async (dir) => {
    const data = await archiveFixture(dir);
    const stub = postgresStub();
    const result = await restoreNew(
      data.archive,
      data.key,
      data.env,
      data.work,
      target,
      target,
      stub.dependencies,
    );
    assert.equal(result.ok, true);
    assert.equal(result.rows, '3');
    assert.equal(result.databasePreserved, true);
    assert.equal(result.productionConnectionChanged, false);
    assert.deepEqual(stub.connections, ['/postgres', '/' + target]);
    const restore = stub.executions[1];
    assert(restore.args.includes('--single-transaction'));
    assert(restore.args.includes(`--dbname=${target}`));
    assert(restore.args.includes('--no-owner'));
    assert(!restore.args.join(' ').includes('private-password'));
    assert(!restore.args.includes('--clean'));
    assert(!restore.args.includes('--create'));
    assert.equal(restore.env.PGDATABASE, target);
    assert(!stub.queries.some((call) => /DROP/.test(call.sql)));
    await removeWorkdir(data.work);
  }));

for (const scenario of [
  'restore-error',
  'verification-error',
  'restore-warning',
])
  test(`recuperación ${scenario} conserva el destino para investigar y no filtra errores privados`, async () =>
    fixture(async (dir) => {
      const data = await archiveFixture(dir);
      const stub = postgresStub({
        restoreWarnings: scenario === 'restore-warning',
        restoreError:
          scenario === 'restore-error'
            ? new Error('password=PRIVATE rows confidential')
            : undefined,
        changed: scenario === 'verification-error',
      });
      await assert.rejects(
        restoreNew(
          data.archive,
          data.key,
          data.env,
          data.work,
          target,
          target,
          stub.dependencies,
        ),
        (error) => {
          assert.equal(error.recovery.databasePreserved, true);
          assert.equal(error.recovery.productionConnectionChanged, false);
          assert(!error.message.includes('PRIVATE'));
          assert.match(error.message, /conserva/);
          return true;
        },
      );
      assert(!stub.queries.some((call) => /DROP/.test(call.sql)));
      await removeWorkdir(data.work);
    }));

test('entorno de libpq no hereda conexiones administrativas de recuperación', () => {
  const previous = process.env.RESTORE_ADMIN_URL;
  process.env.RESTORE_ADMIN_URL = 'postgresql://u:private@remote/db';
  try {
    assert.equal(
      connectionEnv(databaseUrl('postgresql://u:p@localhost/db'))
        .RESTORE_ADMIN_URL,
      undefined,
    );
  } finally {
    if (previous === undefined) delete process.env.RESTORE_ADMIN_URL;
    else process.env.RESTORE_ADMIN_URL = previous;
  }
});

function storageStub(data, changes = {}) {
  const sha256 = crypto.createHash('sha256').update(data).digest('hex');
  const marker = {
    id: 'unit',
    createdAt: '2026-10-10T08:00:00Z',
    verifiedAt: '2026-10-10T08:01:00Z',
    keyId: 'unit-key',
    key: 'pos/testing/2026-10-10/unit.posbackup',
    bytes: data.length,
    sha256,
    externalVerified: true,
    restoreVerified: true,
    ...changes.marker,
  };
  const requests = [];
  return {
    marker,
    requests,
    client: {
      send: async (command) => {
        requests.push(command);
        assert(!/Put|Delete/.test(command.constructor.name));
        if (changes.error) throw changes.error;
        if (command.input.Key.endsWith('latest-success.json'))
          return {
            Body: Readable.from([
              Buffer.from(changes.rawMarker || JSON.stringify(marker)),
            ]),
          };
        if (command.constructor.name === 'HeadObjectCommand')
          return {
            ContentLength: data.length,
            Metadata: { sha256 },
            ...changes.head,
          };
        return { Body: Readable.from([changes.body || data]) };
      },
    },
  };
}

test('R2 consulta antigüedad, existencia y metadata sin claves de cifrado ni escrituras', async () => {
  const stub = storageStub(crypto.randomBytes(100));
  const result = await latestStatus(
    storageEnv,
    30,
    stub.client,
    Date.parse('2026-10-10T12:00:00Z'),
  );
  assert.equal(result.status, 'ok');
  assert.equal(result.ageHours, 4);
  assert.equal(result.currentCheck, 'marker-and-head');
  assert.equal(stub.requests.length, 2);
  assert(!JSON.stringify(result).includes('not-real'));
  const stale = await latestStatus(
    storageEnv,
    30,
    stub.client,
    Date.parse('2026-10-12T08:00:00Z'),
  );
  assert.equal(stale.status, 'stale');
});

for (const scenario of [
  'invalid-json',
  'oversized',
  'unverified',
  'future',
  'wrong-path',
  'wrong-id',
  'wrong-head',
  'missing-object',
  'invalid-age',
])
  test(`R2 status rechaza ${scenario} sin acreditar un respaldo`, async () => {
    const changes =
      {
        'invalid-json': { rawMarker: 'not-json' },
        oversized: { rawMarker: 'x'.repeat(17000) },
        unverified: { marker: { restoreVerified: false } },
        future: {
          marker: {
            createdAt: '2027-01-01T08:00:00Z',
            verifiedAt: '2027-01-01T08:01:00Z',
          },
        },
        'wrong-path': { marker: { key: 'other/unit.posbackup' } },
        'wrong-id': { marker: { id: 'other' } },
        'wrong-head': { head: { Metadata: { sha256: 'a'.repeat(64) } } },
        'missing-object': { error: new Error('PRIVATE token') },
      }[scenario] || {};
    const stub = storageStub(crypto.randomBytes(100), changes);
    await assert.rejects(
      latestStatus(
        storageEnv,
        scenario === 'invalid-age' ? 0 : 30,
        stub.client,
        Date.parse('2026-10-10T12:00:00Z'),
      ),
      (error) =>
        error instanceof BackupError && !error.message.includes('PRIVATE'),
    );
  });

test('R2 descarga última copia por indicador y también copias anteriores por clave', async () =>
  fixture(async (dir) => {
    const bytes = crypto.randomBytes(100);
    const stub = storageStub(bytes);
    const result = await downloadBackup(
      storageEnv,
      dir,
      undefined,
      stub.client,
    );
    assert.equal(result.externalVerified, true);
    assert.equal(await hashFile(result.archive), stub.marker.sha256);
    assert.equal(stub.requests.length, 3);
    const olderDir = path.join(dir, 'older');
    const old = storageStub(bytes);
    await downloadBackup(
      storageEnv,
      olderDir,
      'pos/testing/2026-10-09/unit.posbackup',
      old.client,
    );
    assert.equal(old.requests.length, 2);
  }));

for (const scenario of [
  'corrupt',
  'short',
  'oversized-body',
  'oversized-head',
  'overwrite',
  'outside-prefix',
  'traversal',
  'unsafe-file',
])
  test(`R2 download rechaza ${scenario}, limpia solo su parcial y conserva archivos previos`, async () =>
    fixture(async (dir) => {
      const data = crypto.randomBytes(100);
      const changes =
        {
          corrupt: { body: Buffer.alloc(100) },
          short: { body: Buffer.alloc(50) },
          'oversized-body': { body: Buffer.alloc(101) },
          'oversized-head': { head: { ContentLength: 5_000_000_001 } },
        }[scenario] || {};
      const stub = storageStub(data, changes);
      const requestedKey = {
        'outside-prefix': 'other/unit.posbackup',
        traversal: 'pos/testing/../unit.posbackup',
        'unsafe-file': 'pos/testing/unit.json',
      }[scenario];
      if (scenario === 'overwrite')
        await fs.writeFile(path.join(dir, 'unit.posbackup'), 'previo');
      await assert.rejects(
        downloadBackup(storageEnv, dir, requestedKey, stub.client),
      );
      assert(
        !(await fs.readdir(dir)).some((file) => file.endsWith('.partial')),
      );
      if (scenario === 'overwrite')
        assert.equal(
          await fs.readFile(path.join(dir, 'unit.posbackup'), 'utf8'),
          'previo',
        );
      else
        await assert.rejects(fs.stat(path.join(dir, 'unit.posbackup')), {
          code: 'ENOENT',
        });
    }));
