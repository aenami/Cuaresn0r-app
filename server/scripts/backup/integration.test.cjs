// Opt-in: solo PostgreSQL LOCAL. Nunca conecta a Neon ni sube a R2 real.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const dotenv = require('dotenv');
const { Client } = require('pg');
const {
  databaseUrl,
  encryptionKey,
  createBackup,
  restoreTest,
  removeWorkdir,
} = require('./core.cjs');
const {
  uploadAndVerify,
  publishSuccess,
  latestStatus,
  downloadBackup,
} = require('./storage.cjs');
const { main } = require('../postgres-backup.cjs');

test(
  'integración local: dump, cifrado, transporte S3 simulado, descarga y recuperación conservada',
  {
    skip: !process.env.POS_BACKUP_INTEGRATION_ENV_FILE,
    timeout: 180000,
  },
  async () => {
    const env = {};
    const loaded = dotenv.config({
      path: process.env.POS_BACKUP_INTEGRATION_ENV_FILE,
      quiet: true,
      processEnv: env,
    });
    if (loaded.error)
      throw new Error(
        'No se pudo leer la configuración privada de integración.',
      );
    databaseUrl(env.BACKUP_DATABASE_URL, { localOnly: true });
    const adminUrl = databaseUrl(env.RESTORE_TEST_ADMIN_URL, {
      localOnly: true,
    });
    adminUrl.pathname = '/postgres';
    env.RESTORE_ADMIN_URL = adminUrl.toString();
    assert(
      env.BACKUP_DIR &&
        path.resolve(env.BACKUP_DIR) !==
          path.parse(path.resolve(env.BACKUP_DIR)).root,
    );
    await fs.mkdir(env.BACKUP_DIR, { recursive: true, mode: 0o700 });
    const dir = await fs.mkdtemp(path.join(env.BACKUP_DIR, 'integration-'));
    env.BACKUP_DIR = dir;
    Object.assign(env, {
      BACKUP_S3_BUCKET: 'integration-private',
      BACKUP_S3_PREFIX: 'pos/testing',
      BACKUP_S3_ENDPOINT: 'https://test.r2.cloudflarestorage.com',
      BACKUP_S3_ACCESS_KEY_ID: 'dummy',
      BACKUP_S3_SECRET_ACCESS_KEY: 'not-real',
    });
    const objects = new Map();
    const storage = {
      send: async (command) => {
        const { Key, Body, Metadata } = command.input;
        if (command.constructor.name === 'PutObjectCommand') {
          const chunks = [];
          if (typeof Body === 'string') chunks.push(Buffer.from(Body));
          else for await (const chunk of Body) chunks.push(Buffer.from(chunk));
          objects.set(Key, { data: Buffer.concat(chunks), metadata: Metadata });
          return {};
        }
        const object = objects.get(Key);
        assert(object, 'Falta el objeto del transporte simulado.');
        if (command.constructor.name === 'HeadObjectCommand')
          return {
            ContentLength: object.data.length,
            Metadata: object.metadata,
          };
        assert.equal(command.constructor.name, 'GetObjectCommand');
        return { Body: Readable.from([object.data]) };
      },
    };
    const name = `pos_recovered_integration_${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}_${crypto.randomBytes(6).toString('hex')}`;
    const admin = new Client({ connectionString: adminUrl.toString() });
    let backup, testWork, recoveryOid;
    try {
      await admin.connect();
      assert.equal(
        (
          await admin.query('SELECT oid FROM pg_database WHERE datname=$1', [
            name,
          ])
        ).rows.length,
        0,
      );
      backup = await createBackup(env, dir);
      const remote = await uploadAndVerify(
        backup.archive,
        backup.receipt,
        env,
        backup.workdir,
        storage,
      );
      Object.assign(backup.receipt, remote.storage);
      testWork = await fs.mkdtemp(path.join(dir, '.restore-work-'));
      backup.receipt.restoreTest = await restoreTest(
        remote.downloaded,
        encryptionKey(env.BACKUP_ENCRYPTION_KEY),
        env.RESTORE_TEST_ADMIN_URL,
        env,
        testWork,
      );
      assert.equal(backup.receipt.restoreTest.testDatabaseRemoved, true);
      await publishSuccess(backup.receipt, env, storage);
      assert.equal((await latestStatus(env, 30, storage)).status, 'ok');
      const downloaded = await downloadBackup(
        env,
        path.join(dir, 'downloaded'),
        undefined,
        storage,
      );
      const recovered = await main(
        [
          'restore-new',
          '--file',
          downloaded.archive,
          '--database',
          name,
          '--confirm',
          name,
        ],
        env,
      );
      assert.equal(recovered.ok, true);
      assert.equal(recovered.databasePreserved, true);
      assert.equal(recovered.productionConnectionChanged, false);
      recoveryOid = (
        await admin.query('SELECT oid FROM pg_database WHERE datname=$1', [
          name,
        ])
      ).rows[0].oid;
      // El segundo intento debe rechazar el destino conservado sin modificarlo.
      await assert.rejects(
        main(
          [
            'restore-new',
            '--file',
            downloaded.archive,
            '--database',
            name,
            '--confirm',
            name,
          ],
          env,
        ),
        /ya existe/,
      );
      assert.equal(
        (
          await admin.query('SELECT oid FROM pg_database WHERE datname=$1', [
            name,
          ])
        ).rows[0].oid,
        recoveryOid,
      );
    } finally {
      try {
        if (recoveryOid !== undefined) {
          databaseUrl(adminUrl.toString(), { localOnly: true });
          assert.match(
            name,
            /^pos_recovered_integration_[0-9]{14}_[a-f0-9]{12}$/,
          );
          const current = (
            await admin.query('SELECT oid FROM pg_database WHERE datname=$1', [
              name,
            ])
          ).rows[0];
          assert.equal(
            current?.oid,
            recoveryOid,
            'No retirar una base reemplazada por otro proceso.',
          );
          await admin.query(`DROP DATABASE "${name}"`);
          assert.equal(
            (
              await admin.query(
                'SELECT oid FROM pg_database WHERE datname=$1',
                [name],
              )
            ).rows.length,
            0,
          );
        }
        if (backup) await removeWorkdir(backup.workdir);
        if (testWork) await removeWorkdir(testWork);
      } finally {
        await admin.end();
      }
    }
  },
);
