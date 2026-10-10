const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { spawn } = require('node:child_process');
const { Client } = require('pg');

const MAGIC = Buffer.from('POSBK01\n');
const HEADER_SIZE = MAGIC.length + 12;
const TAG_SIZE = 16;
const MAX_MANIFEST = 4 * 1024 * 1024;
const FORMAT = 'corepos-postgres/v1';
const TEST_PREFIX = 'pos_restore_test_';

class BackupError extends Error {}

function encryptionKey(value) {
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value))
    throw new BackupError(
      'BACKUP_ENCRYPTION_KEY debe contener 32 bytes aleatorios en Base64.',
    );
  const key = Buffer.from(value, 'base64');
  if (
    key.length !== 32 ||
    key.toString('base64') !== value ||
    new Set(key).size < 8
  )
    throw new BackupError(
      'La clave de respaldo no es válida o no es aleatoria. Usa keygen.',
    );
  return key;
}

function databaseUrl(value, { localOnly = false } = {}) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new BackupError('Falta una conexión PostgreSQL válida.');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !url.username ||
    url.pathname.length < 2
  )
    throw new BackupError(
      'La conexión debe indicar usuario y base PostgreSQL.',
    );
  if (
    url.searchParams.has('host') ||
    url.searchParams.has('port') ||
    url.searchParams.has('service')
  )
    throw new BackupError(
      'No se admiten hosts, puertos o servicios alternativos en la conexión.',
    );
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (localOnly && !local)
    throw new BackupError(
      'La restauración de prueba solo admite PostgreSQL local, nunca Neon.',
    );
  if (url.hostname.includes('-pooler'))
    throw new BackupError(
      'Usa la conexión DIRECTA de Neon, no la conexión pooled.',
    );
  const allowed = [
    'schema',
    'sslmode',
    'sslrootcert',
    'channel_binding',
    'connect_timeout',
  ];
  if ([...url.searchParams.keys()].some((key) => !allowed.includes(key)))
    throw new BackupError(
      'La conexión contiene opciones no admitidas por el respaldo.',
    );
  const parameters = [...url.searchParams.keys()];
  if (new Set(parameters).size !== parameters.length)
    throw new BackupError(
      'La conexión contiene opciones repetidas y ambiguas.',
    );
  if (
    !local &&
    !['require', 'verify-full', 'verify-ca'].includes(
      url.searchParams.get('sslmode'),
    )
  )
    throw new BackupError(
      'La conexión remota debe exigir TLS; se recomienda sslmode=verify-full.',
    );
  url.searchParams.delete('schema');
  return url;
}

function connectionEnv(url) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('PG')) delete env[key];
  Object.assign(env, {
    PGHOST: url.hostname.replace(/^\[|\]$/g, ''),
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGCONNECT_TIMEOUT: '20',
    PGAPPNAME: 'corepos-backup',
    PGSSLMODE: url.searchParams.get('sslmode') || 'disable',
  });
  if (url.searchParams.get('sslrootcert'))
    env.PGSSLROOTCERT = url.searchParams.get('sslrootcert');
  if (url.searchParams.get('channel_binding'))
    env.PGCHANNELBINDING = url.searchParams.get('channel_binding');
  // La clave de cifrado y el almacenamiento no son necesarios para libpq.
  for (const key of Object.keys(env))
    if (
      key.startsWith('BACKUP_') ||
      /SECRET|TOKEN|PASSWORD|DATABASE_URL|CLOUDINARY|PRINT_AGENT|RESTORE_/.test(
        key,
      )
    )
      delete env[key];
  // PGPASSWORD es necesario, pero se asigna después de retirar otros secretos.
  env.PGPASSWORD = decodeURIComponent(url.password);
  return env;
}

function pgTool(name, env = process.env) {
  const binary = process.platform === 'win32' ? `${name}.exe` : name;
  return env.PG_BIN_DIR ? path.resolve(env.PG_BIN_DIR, binary) : binary;
}

function runTool(binary, args, env, timeout = 20 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      env,
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '',
      stderr = '',
      expired = false;
    child.stdout.on('data', (data) => {
      if (stdout.length < 1024 * 1024) stdout += data.toString();
    });
    child.stderr.on('data', (data) => {
      if (stderr.length < 8192) stderr += data.toString();
    });
    const timer = setTimeout(() => {
      expired = true;
      child.kill();
    }, timeout);
    child.on('error', () => {
      clearTimeout(timer);
      reject(
        new BackupError(
          `No se pudo iniciar ${path.basename(binary)}. Revisa PG_BIN_DIR.`,
        ),
      );
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (expired || code !== 0) {
        // No imprimir stdout/stderr del servidor: pueden contener datos de clientes.
        reject(
          new BackupError(
            `${path.basename(binary)} falló${expired ? ' por tiempo límite' : ` con código ${code}`}. Revisa conexión, permisos y versión de PostgreSQL.`,
          ),
        );
      } else resolve({ stdout, warnings: Boolean(stderr.trim()) });
    });
  });
}

function identifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}
function digest(value) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex');
}

function canonicalConstraintDefinition(value) {
  // pg_dump vuelve a parsear CHECK: PostgreSQL puede mover la coerción de un
  // ARRAY varchar literal a sus elementos. Normalizar SOLO ese caso equivalente;
  // conservar el resto de la expresión, tipos, valores y operadores intactos.
  return value.replace(
    /\(\(ARRAY\[((?:'(?:[^']|'')*'::character varying(?:, )?)+)\]\)::text\[\]\)/g,
    (_, literals) =>
      '(ARRAY[' +
      literals.replace(/('(?:[^']|'')*'::character varying)/g, '($1)::text') +
      '])',
  );
}

async function hashFile(file) {
  const hash = crypto.createHash('sha256');
  for await (const data of fs.createReadStream(file)) hash.update(data);
  return hash.digest('hex');
}

async function removeWorkdir(dir) {
  const resolved = path.resolve(dir);
  const stat = await fsp.lstat(resolved);
  if (
    !/^\.(backup|restore)-work-[A-Za-z0-9]+$/.test(path.basename(resolved)) ||
    stat.isSymbolicLink() ||
    !stat.isDirectory()
  )
    throw new BackupError(
      'Se rechazó limpiar una ruta que no es temporal de esta herramienta.',
    );
  for (const name of [
    'source.dump',
    'verified.dump',
    'verified-package.bin',
    'downloaded.posbackup',
  ])
    await fsp.rm(path.join(resolved, name), { force: true });
  await fsp.rmdir(resolved);
}

async function describeDatabase(client) {
  await client.query("SET TIME ZONE 'UTC'");
  await client.query("SET datestyle = 'ISO, YMD'");
  await client.query('SET extra_float_digits = 3');
  const tables = (
    await client.query(`
    SELECT n.nspname AS schema, c.relname AS name, c.relkind AS kind
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p') AND n.nspname NOT IN ('pg_catalog','information_schema')
      AND n.nspname NOT LIKE 'pg_%' ORDER BY n.nspname COLLATE "C", c.relname COLLATE "C"
  `)
  ).rows;
  const data = [];
  // Serial dentro de la misma conexión/snapshot: no ejecutar consultas concurrentes en pg.
  for (const table of tables) {
    const result = await client.query(`
      SELECT count(*)::text AS rows,
        md5(coalesce(string_agg(fingerprint, '' ORDER BY fingerprint COLLATE "C"), '')) AS fingerprint
      FROM (SELECT md5(row_to_json(t)::text) AS fingerprint
        FROM ${identifier(table.schema)}.${identifier(table.name)} t) records
    `);
    data.push({ ...table, ...result.rows[0] });
  }
  const catalog = {};
  const queries = {
    columns: `SELECT n.nspname AS schema,c.relname AS relation,a.attname AS name,
      row_number() OVER (PARTITION BY n.nspname,c.relname ORDER BY a.attnum)::int AS position,
      format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS notnull,a.attidentity AS identity,
      a.attgenerated AS generated,pg_get_expr(d.adbin,d.adrelid) AS default
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
      WHERE a.attnum>0 AND NOT a.attisdropped AND c.relkind IN ('r','p','v','m','f')
      AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_%'
      ORDER BY n.nspname COLLATE "C",c.relname COLLATE "C",a.attnum`,
    indexes: `SELECT n.nspname AS schema,c.relname AS name,pg_get_indexdef(c.oid) AS definition
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('i','I')
      AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_%'
      ORDER BY n.nspname COLLATE "C",c.relname COLLATE "C"`,
    constraints: `SELECT n.nspname AS schema,c.relname AS relation,k.conname AS name,
      pg_get_constraintdef(k.oid) AS definition,k.convalidated AS validated
      FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_%'
      ORDER BY n.nspname COLLATE "C",c.relname COLLATE "C",k.conname COLLATE "C"`,
    enums: `SELECT n.nspname AS schema,t.typname AS name,e.enumlabel AS value,e.enumsortorder AS position
      FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace
      WHERE n.nspname NOT LIKE 'pg_%' ORDER BY n.nspname COLLATE "C",t.typname COLLATE "C",e.enumsortorder`,
    sequences: `SELECT n.nspname AS schema,c.relname AS name,format_type(s.seqtypid,NULL) AS type,
      s.seqstart::text AS start,s.seqincrement::text AS increment,s.seqmax::text AS max,
      s.seqmin::text AS min,s.seqcache::text AS cache,s.seqcycle AS cycle
      FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_%'
      ORDER BY n.nspname COLLATE "C",c.relname COLLATE "C"`,
    routines: `SELECT n.nspname AS schema,p.proname AS name,pg_get_function_identity_arguments(p.oid) AS arguments,
      pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE p.prokind IN ('f','p') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_%'
      ORDER BY n.nspname COLLATE "C",p.proname COLLATE "C",pg_get_function_identity_arguments(p.oid) COLLATE "C"`,
    triggers: `SELECT n.nspname AS schema,c.relname AS relation,t.tgname AS name,t.tgenabled AS enabled,
      pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal
      AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_%'
      ORDER BY n.nspname COLLATE "C",c.relname COLLATE "C",t.tgname COLLATE "C"`,
    views: `SELECT n.nspname AS schema,c.relname AS name,pg_get_viewdef(c.oid,true) AS definition
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('v','m')
      AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_%'
      ORDER BY n.nspname COLLATE "C",c.relname COLLATE "C"`,
  };
  for (const [name, sql] of Object.entries(queries))
    catalog[name] = (await client.query(sql)).rows;
  catalog.constraints = catalog.constraints.map((row) => ({
    ...row,
    definition: canonicalConstraintDefinition(row.definition),
  }));
  return {
    data,
    catalogHash: digest(catalog),
    catalogHashes: Object.fromEntries(
      Object.entries(catalog).map(([name, rows]) => [name, digest(rows)]),
    ),
    catalogCounts: Object.fromEntries(
      Object.entries(catalog).map(([name, rows]) => [name, rows.length]),
    ),
  };
}

async function encryptArchive(dumpFile, manifest, key, output) {
  const json = Buffer.from(JSON.stringify(manifest));
  if (json.length > MAX_MANIFEST)
    throw new BackupError('El manifiesto supera el límite permitido.');
  const size = Buffer.alloc(4);
  size.writeUInt32BE(json.length);
  const header = Buffer.concat([MAGIC, crypto.randomBytes(12)]);
  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    key,
    header.subarray(MAGIC.length),
  );
  cipher.setAAD(header);
  async function* payload() {
    yield size;
    yield json;
    for await (const chunk of fs.createReadStream(dumpFile)) yield chunk;
  }
  const partial = `${output}.partial`;
  let ownedPartial = false;
  try {
    const destination = fs.createWriteStream(partial, {
      flags: 'wx',
      mode: 0o600,
    });
    destination.once('open', () => {
      ownedPartial = true;
    });
    destination.write(header);
    await pipeline(Readable.from(payload()), cipher, destination);
    await fsp.appendFile(partial, cipher.getAuthTag());
    // No sobrescribir otro respaldo, ni siquiera con un identificador repetido.
    await fsp.copyFile(partial, output, fs.constants.COPYFILE_EXCL);
    return {
      sha256: await hashFile(output),
      bytes: (await fsp.stat(output)).size,
    };
  } finally {
    if (ownedPartial) await fsp.rm(partial, { force: true });
  }
}

async function decryptArchive(archive, key, workdir) {
  const stat = await fsp.stat(archive);
  if (!stat.isFile() || stat.size < HEADER_SIZE + TAG_SIZE + 4)
    throw new BackupError('El archivo no es un respaldo válido.');
  const handle = await fsp.open(archive, 'r');
  const header = Buffer.alloc(HEADER_SIZE),
    tag = Buffer.alloc(TAG_SIZE);
  try {
    await handle.read(header, 0, header.length, 0);
    await handle.read(tag, 0, tag.length, stat.size - TAG_SIZE);
  } finally {
    await handle.close();
  }
  if (!header.subarray(0, MAGIC.length).equals(MAGIC))
    throw new BackupError('Formato de respaldo no reconocido.');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    header.subarray(MAGIC.length),
  );
  decipher.setAAD(header);
  decipher.setAuthTag(tag);
  const container = path.join(workdir, 'verified-package.bin');
  let ownedContainer = false;
  try {
    const destination = fs.createWriteStream(container, {
      flags: 'wx',
      mode: 0o600,
    });
    destination.once('open', () => {
      ownedContainer = true;
    });
    await pipeline(
      fs.createReadStream(archive, {
        start: HEADER_SIZE,
        end: stat.size - TAG_SIZE - 1,
      }),
      decipher,
      destination,
    );
  } catch {
    if (ownedContainer) await fsp.rm(container, { force: true });
    throw new BackupError(
      'Cifrado inválido: clave incorrecta o respaldo alterado. No se restauró nada.',
    );
  }
  const verified = await fsp.open(container, 'r');
  let manifest, length;
  try {
    const prefix = Buffer.alloc(4);
    await verified.read(prefix, 0, 4, 0);
    length = prefix.readUInt32BE();
    if (
      length < 2 ||
      length > MAX_MANIFEST ||
      length + 4 >= (await verified.stat()).size
    )
      throw new BackupError('Manifiesto de respaldo inválido.');
    const json = Buffer.alloc(length);
    await verified.read(json, 0, length, 4);
    manifest = JSON.parse(json.toString('utf8'));
    if (
      manifest.format !== FORMAT ||
      !/^[a-zA-Z0-9_-][a-zA-Z0-9._-]{0,159}$/.test(manifest.id || '') ||
      manifest.id.includes('..') ||
      !Array.isArray(manifest.database?.data) ||
      !/^[a-f0-9]{64}$/.test(manifest.dumpSha256)
    )
      throw new BackupError(
        'El manifiesto no corresponde a este formato de respaldo.',
      );
  } finally {
    await verified.close();
  }
  const dump = path.join(workdir, 'verified.dump');
  await pipeline(
    fs.createReadStream(container, { start: 4 + length }),
    fs.createWriteStream(dump, { flags: 'wx', mode: 0o600 }),
  );
  if ((await hashFile(dump)) !== manifest.dumpSha256)
    throw new BackupError('La huella del dump no coincide.');
  return { manifest, dump };
}

function checkRestored(expected, actual) {
  if (expected.catalogHash !== actual.catalogHash) {
    const changed = Object.keys(expected.catalogHashes || {}).filter(
      (name) => expected.catalogHashes[name] !== actual.catalogHashes?.[name],
    );
    throw new BackupError(
      `El esquema restaurado no coincide${changed.length ? ': ' + changed.join(', ') : ' (columnas, índices, restricciones o enums)'}.`,
    );
  }
  if (digest(expected.data) !== digest(actual.data))
    throw new BackupError(
      'Las filas o huellas de datos restauradas no coinciden.',
    );
  return {
    tables: actual.data.length,
    rows: actual.data
      .reduce((sum, table) => sum + BigInt(table.rows), 0n)
      .toString(),
    catalog: actual.catalogCounts,
  };
}

function assertOwnedTestDatabase(url, name) {
  databaseUrl(url.toString(), { localOnly: true });
  if (!/^pos_restore_test_[0-9]{14}_[a-f0-9]{12}$/.test(name))
    throw new BackupError(
      'Se rechazó una base que no fue creada para esta prueba.',
    );
  if (decodeURIComponent(url.pathname.slice(1)) === name)
    throw new BackupError(
      'La base de prueba no puede ser la base administrativa.',
    );
}

function assertRecoveryTarget(adminUrl, name, confirmation) {
  const parsed = databaseUrl(adminUrl);
  if (!/^pos_recovered_[a-z0-9][a-z0-9_]{0,44}$/.test(name || ''))
    throw new BackupError(
      'Usa un nombre nuevo pos_recovered_ seguido de letras minúsculas, números o guiones bajos (máximo 59 caracteres).',
    );
  if (confirmation !== name)
    throw new BackupError(
      '--confirm debe repetir exactamente el nombre de --database. No se creó ninguna base.',
    );
  if (decodeURIComponent(parsed.pathname.slice(1)) === name)
    throw new BackupError(
      'El destino no puede ser la base de la conexión administrativa.',
    );
  return parsed;
}

function assertArchiveKeyId(manifest, env) {
  if (
    !/^[a-zA-Z0-9-]{1,40}$/.test(manifest.keyId || '') ||
    manifest.keyId !== env.BACKUP_KEY_ID
  )
    throw new BackupError(
      'BACKUP_KEY_ID no coincide con la clave identificada en el respaldo. Usa la configuración archivada correspondiente.',
    );
}

// Recuperación real: crea una base nueva y la CONSERVA. No hay DROP, --clean,
// seed ni cambio de conexión de la API. Las dependencias opcionales permiten
// probar cada protección sin tocar servidores externos.
async function restoreNew(
  archive,
  key,
  env,
  workdir,
  name,
  confirmation,
  dependencies = {},
) {
  const parsed = assertRecoveryTarget(
    env.RESTORE_ADMIN_URL,
    name,
    confirmation,
  );
  const { manifest, dump } = await decryptArchive(archive, key, workdir);
  assertArchiveKeyId(manifest, env);
  const ClientClass = dependencies.Client || Client;
  const execute = dependencies.runTool || runTool;
  const describe = dependencies.describeDatabase || describeDatabase;
  const restoreVersion = await execute(
    pgTool('pg_restore', env),
    ['--version'],
    connectionEnv(parsed),
  );
  const toolMajor = Number(
    restoreVersion.stdout.match(/PostgreSQL\)\s+(\d+)/)?.[1],
  );
  const dumpMajor = Number(
    manifest.dumpVersion?.match(/PostgreSQL\)\s+(\d+)/)?.[1],
  );
  const sourceMajor = Number(manifest.sourceVersion?.split('.')[0]);
  if (!sourceMajor || !dumpMajor || !toolMajor || toolMajor < dumpMajor)
    throw new BackupError(
      'pg_restore debe ser compatible con la versión de pg_dump indicada en el respaldo.',
    );
  const admin = new ClientClass({
    connectionString: parsed.toString(),
    connectionTimeoutMillis: 20000,
  });
  let created = false;
  try {
    await admin.connect();
    const info = (
      await admin.query("SELECT current_setting('server_version') AS version")
    ).rows[0];
    if (Number(info.version.split('.')[0]) !== sourceMajor)
      throw new BackupError(
        'La recuperación requiere la misma versión mayor de PostgreSQL que el origen.',
      );
    const existing = await admin.query(
      'SELECT oid FROM pg_database WHERE datname=$1',
      [name],
    );
    if (existing.rows.length)
      throw new BackupError(
        'La base de destino ya existe. No se modificó; elige un nombre nuevo.',
      );
    // CREATE sin IF NOT EXISTS también rechaza una carrera con otro operador.
    await admin.query(
      `CREATE DATABASE ${identifier(name)} TEMPLATE template0 ENCODING 'UTF8'`,
    );
    created = true;
    const target = new URL(parsed);
    target.pathname = '/' + name;
    const restored = await execute(
      pgTool('pg_restore', env),
      [
        `--dbname=${name}`,
        '--exit-on-error',
        '--single-transaction',
        '--no-owner',
        '--no-acl',
        '--no-password',
        dump,
      ],
      connectionEnv(target),
    );
    if (restored.warnings)
      throw new BackupError(
        'pg_restore emitió advertencias. Revisa la base nueva antes de considerarla recuperada.',
      );
    const client = new ClientClass({
      connectionString: target.toString(),
      connectionTimeoutMillis: 20000,
    });
    let verified;
    try {
      await client.connect();
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      verified = checkRestored(manifest.database, await describe(client));
      await client.query('ROLLBACK');
    } finally {
      await client.end();
    }
    return {
      ...verified,
      backupId: manifest.id,
      backupCreatedAt: manifest.createdAt,
      keyId: manifest.keyId,
      archiveSha256: await hashFile(archive),
      database: name,
      databasePreserved: true,
      productionConnectionChanged: false,
      verifiedAt: new Date().toISOString(),
      ok: true,
    };
  } catch (error) {
    const reason =
      error instanceof BackupError
        ? error.message
        : 'Revisa conexión, permisos CREATEDB, versión y disponibilidad del destino.';
    const failure = new BackupError(
      `Falló la recuperación. ${reason}${created ? ' La base nueva se conserva para revisión; no la conectes a la API.' : ' No se restauró sobre ninguna base existente.'}`,
    );
    failure.recovery = {
      database: name,
      databaseCreated: created,
      databasePreserved: created,
      productionConnectionChanged: false,
      ok: false,
    };
    throw failure;
  } finally {
    await admin.end();
  }
}

async function restoreTest(archive, key, adminUrl, pgBinEnv, workdir) {
  const parsed = databaseUrl(adminUrl, { localOnly: true });
  // La conexión administrativa nunca usa la base operativa.
  parsed.pathname = '/postgres';
  const { manifest, dump } = await decryptArchive(archive, key, workdir);
  const name =
    TEST_PREFIX +
    new Date().toISOString().replace(/\D/g, '').slice(0, 14) +
    '_' +
    crypto.randomBytes(6).toString('hex');
  assertOwnedTestDatabase(parsed, name);
  const admin = new Client({
    connectionString: parsed.toString(),
    connectionTimeoutMillis: 20000,
  });
  let createdOid, result;
  try {
    await admin.connect();
    const targetVersion = (
      await admin.query("SELECT current_setting('server_version') AS version")
    ).rows[0].version;
    if (
      manifest.sourceVersion &&
      targetVersion.split('.')[0] !== manifest.sourceVersion.split('.')[0]
    )
      throw new BackupError(
        'La prueba requiere la misma versión mayor de PostgreSQL que el origen.',
      );
    await admin.query(
      `CREATE DATABASE ${identifier(name)} TEMPLATE template0 ENCODING 'UTF8'`,
    );
    createdOid = (
      await admin.query('SELECT oid FROM pg_database WHERE datname=$1', [name])
    ).rows[0].oid;
    const target = new URL(parsed);
    target.pathname = '/' + name;
    await runTool(
      pgTool('pg_restore', pgBinEnv),
      [
        `--dbname=${name}`,
        '--exit-on-error',
        '--single-transaction',
        '--no-owner',
        '--no-acl',
        '--no-password',
        dump,
      ],
      connectionEnv(target),
    );
    const client = new Client({
      connectionString: target.toString(),
      connectionTimeoutMillis: 20000,
    });
    try {
      await client.connect();
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      result = {
        ...checkRestored(manifest.database, await describeDatabase(client)),
        database: name,
        backupId: manifest.id,
        ok: true,
      };
      await client.query('ROLLBACK');
    } finally {
      await client.end();
    }
    return result;
  } finally {
    try {
      if (createdOid !== undefined) {
        assertOwnedTestDatabase(parsed, name);
        const current = (
          await admin.query('SELECT oid FROM pg_database WHERE datname=$1', [
            name,
          ])
        ).rows[0];
        if (!current || current.oid !== createdOid)
          throw new BackupError(
            'No se pudo validar la base temporal para retirarla.',
          );
        // Sin FORCE: no cerrar conexiones de terceros. Solo retirar la base recién creada.
        await admin.query(`DROP DATABASE ${identifier(name)}`);
        if (result) result.testDatabaseRemoved = true;
      }
    } finally {
      await admin.end();
    }
  }
}

async function createBackup(env, outputDir) {
  const source = databaseUrl(env.BACKUP_DATABASE_URL);
  const key = encryptionKey(env.BACKUP_ENCRYPTION_KEY);
  const label = env.BACKUP_LABEL || 'pos',
    keyId = env.BACKUP_KEY_ID;
  if (
    !/^[a-z0-9-]{1,40}$/.test(label) ||
    !/^[a-zA-Z0-9-]{1,40}$/.test(keyId || '')
  )
    throw new BackupError(
      'Configura BACKUP_LABEL y BACKUP_KEY_ID con letras, números o guiones.',
    );
  await fsp.mkdir(outputDir, { recursive: true, mode: 0o700 });
  const workdir = await fsp.mkdtemp(path.join(outputDir, '.backup-work-'));
  const client = new Client({
    connectionString: source.toString(),
    connectionTimeoutMillis: 20000,
    query_timeout: 120000,
  });
  const id = `${label}-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(6).toString('hex')}`;
  const startedAt = new Date().toISOString();
  const archive = path.join(outputDir, `${id}.posbackup`);
  try {
    const version = await runTool(
      pgTool('pg_dump', env),
      ['--version'],
      connectionEnv(source),
    );
    await client.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const info = (
      await client.query(
        "SELECT current_setting('server_version') AS version, current_database() AS database, pg_export_snapshot() AS snapshot",
      )
    ).rows[0];
    const major = Number(version.stdout.match(/PostgreSQL\)\s+(\d+)/)?.[1]);
    if (!major || major < Number(info.version.split('.')[0]))
      throw new BackupError(
        'pg_dump debe tener una versión mayor o igual a la base de origen.',
      );
    const database = await describeDatabase(client);
    const dump = path.join(workdir, 'source.dump');
    const dumped = await runTool(
      pgTool('pg_dump', env),
      [
        '--format=custom',
        '--no-acl',
        '--no-password',
        '--lock-wait-timeout=10000',
        `--snapshot=${info.snapshot}`,
        `--file=${dump}`,
      ],
      connectionEnv(source),
    );
    if (dumped.warnings)
      throw new BackupError(
        'pg_dump emitió advertencias; revisa el respaldo antes de considerarlo correcto.',
      );
    await client.query('ROLLBACK');
    const listed = await runTool(
      pgTool('pg_restore', env),
      ['--list', dump],
      connectionEnv(source),
    );
    if (!listed.stdout.includes('TABLE'))
      throw new BackupError('El dump no contiene tablas verificables.');
    const manifest = {
      format: FORMAT,
      id,
      label,
      keyId,
      createdAt: startedAt,
      sourceVersion: info.version,
      dumpVersion: version.stdout.trim(),
      database,
      dumpSha256: await hashFile(dump),
    };
    const encrypted = await encryptArchive(dump, manifest, key, archive);
    return {
      archive,
      workdir,
      manifest,
      receipt: {
        format: FORMAT,
        id,
        keyId,
        createdAt: manifest.createdAt,
        ...encrypted,
        dumpWarnings: dumped.warnings,
        externalVerified: false,
      },
    };
  } catch (error) {
    await removeWorkdir(workdir);
    if (error instanceof BackupError) throw error;
    throw new BackupError(
      'No se pudo respaldar PostgreSQL. Revisa conexión y permisos; no se modificó el origen.',
    );
  } finally {
    await client.end();
  }
}

module.exports = {
  BackupError,
  encryptionKey,
  databaseUrl,
  connectionEnv,
  hashFile,
  encryptArchive,
  decryptArchive,
  checkRestored,
  canonicalConstraintDefinition,
  assertOwnedTestDatabase,
  assertRecoveryTarget,
  assertArchiveKeyId,
  restoreNew,
  restoreTest,
  createBackup,
  removeWorkdir,
};
