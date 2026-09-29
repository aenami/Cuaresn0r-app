// Recuperación administrativa desde el servidor. Nunca cambia el área,
// empleado, contraseña ni historial de un usuario que ya existe.
const path = require('node:path');
const { Client } = require('pg');
const bcrypt = require('bcrypt');

class ProvisionError extends Error {}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--help' || arg === '--permitir-remoto') {
      if (options[arg]) throw new ProvisionError('Hay opciones repetidas.');
      options[arg] = true;
      continue;
    }
    if (!['--email', '--area', '--empleado-id', '--confirmar'].includes(arg))
      throw new ProvisionError('Opción desconocida; consulta --help.');
    if (options[arg] !== undefined)
      throw new ProvisionError('Hay opciones repetidas.');
    const value = args[++index];
    if (!value || value.startsWith('--'))
      throw new ProvisionError('Falta el valor de una opción.');
    options[arg] = value;
  }
  if (options['--help']) return { help: true };
  const email = options['--email']?.trim();
  if (!email || email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new ProvisionError('Indica un --email válido.');
  const area = options['--area'];
  if (!['RESTAURANTE', 'PANADERIA'].includes(area))
    throw new ProvisionError('--area debe ser RESTAURANTE o PANADERIA.');
  let empleadoId;
  if (options['--empleado-id'] !== undefined) {
    if (!/^[1-9]\d*$/.test(options['--empleado-id']))
      throw new ProvisionError('--empleado-id debe ser un entero positivo.');
    empleadoId = Number(options['--empleado-id']);
    if (!Number.isSafeInteger(empleadoId))
      throw new ProvisionError('--empleado-id no es válido.');
  }
  const modo = empleadoId === undefined ? 'ASIGNAR' : 'CREAR';
  const confirmacion = options['--confirmar'];
  if (confirmacion !== undefined && confirmacion !== `${modo}_ADMIN_LOCAL`)
    throw new ProvisionError(
      `La confirmación requerida para este modo es ${modo}_ADMIN_LOCAL.`,
    );
  return {
    email,
    area,
    empleadoId,
    modo,
    confirmar: confirmacion !== undefined,
    permitirRemoto: Boolean(options['--permitir-remoto']),
  };
}

function connectionString(env, options) {
  let url;
  try {
    url = new URL(env.DATABASE_URL);
  } catch {
    throw new ProvisionError('Configura DATABASE_URL en el servidor.');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !url.pathname ||
    url.pathname === '/'
  )
    throw new ProvisionError('DATABASE_URL debe indicar una base PostgreSQL.');
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
    !options.permitirRemoto
  )
    throw new ProvisionError(
      'Base no local: añade --permitir-remoto solamente si quieres operar ese servidor.',
    );
  return url.toString();
}

async function provision(client, options, env = process.env) {
  const preview = !options.confirmar;
  await client.query(preview ? 'BEGIN READ ONLY' : 'BEGIN');
  try {
    // Comparte el bloqueo usado por UsuariosService y EmpleadosService.
    // Así, una baja concurrente no puede eludir la protección del último global.
    const roles = await client.query(`
      SELECT id_rol, nombre_rol FROM "public"."Rol"
      WHERE nombre_rol IN ('ADMIN_GLOBAL', 'ADMIN', 'ADMIN_LOCAL')
      ORDER BY id_rol ${preview ? '' : 'FOR UPDATE'}
    `);
    const local = roles.rows.find((role) => role.nombre_rol === 'ADMIN_LOCAL');
    if (!local)
      throw new ProvisionError(
        'Falta el rol ADMIN_LOCAL; aplica las migraciones antes.',
      );

    const users = await client.query(
      `
      SELECT u.id_usuario, u.area::text AS area_usuario,
             r.nombre_rol, e.id_empleado, e.area::text AS area_empleado,
             e.estado_empleado::text AS estado_empleado
      FROM "public"."Usuario" u
      JOIN "public"."Rol" r ON r.id_rol = u.id_rol
      JOIN "public"."Empleado" e ON e.id_empleado = u.id_empleado_usuario
      WHERE u.email_usuario = $1 ${preview ? '' : 'FOR UPDATE OF u, e'}
    `,
      [options.email],
    );
    const existing = users.rows[0];
    let empleado;
    if (options.modo === 'ASIGNAR') {
      if (!existing)
        throw new ProvisionError(
          'El usuario no existe. Para crearlo indica --empleado-id de un empleado existente.',
        );
      if (
        existing.area_usuario !== options.area ||
        existing.area_empleado !== options.area
      )
        throw new ProvisionError(
          'Usuario y empleado deben pertenecer al área indicada; no se reasigna historial.',
        );
      if (existing.estado_empleado !== 'ACTIVO')
        throw new ProvisionError('El empleado del usuario debe estar ACTIVO.');
      empleado = { id_empleado: existing.id_empleado };
    } else {
      if (existing)
        throw new ProvisionError(
          'Ya existe ese email; usa el modo ASIGNAR sin --empleado-id.',
        );
      const employees = await client.query(
        `
        SELECT id_empleado, area::text AS area, estado_empleado::text AS estado
        FROM "public"."Empleado" WHERE id_empleado = $1
        ${preview ? '' : 'FOR UPDATE'}
      `,
        [options.empleadoId],
      );
      empleado = employees.rows[0];
      if (!empleado)
        throw new ProvisionError(
          'El empleado indicado no existe; este script no crea empleados.',
        );
      if (empleado.area !== options.area || empleado.estado !== 'ACTIVO')
        throw new ProvisionError(
          'El empleado debe estar ACTIVO y pertenecer al área indicada.',
        );
    }

    const globals = await client.query(`
      SELECT COUNT(*)::int AS total FROM "public"."Usuario" u
      JOIN "public"."Rol" r ON r.id_rol = u.id_rol
      JOIN "public"."Empleado" e ON e.id_empleado = u.id_empleado_usuario
      WHERE r.nombre_rol IN ('ADMIN_GLOBAL', 'ADMIN') AND e.estado_empleado = 'ACTIVO'
    `);
    if (globals.rows[0].total === 0)
      throw new ProvisionError(
        'Restaura primero un administrador global activo.',
      );
    if (
      existing &&
      ['ADMIN_GLOBAL', 'ADMIN'].includes(existing.nombre_rol) &&
      globals.rows[0].total <= 1
    )
      throw new ProvisionError(
        'No se puede convertir al último administrador global activo.',
      );

    const result = {
      modo: options.modo,
      area: options.area,
      empleadoId: empleado.id_empleado,
      usuarioId: existing?.id_usuario,
      rolAnterior: existing?.nombre_rol,
      rolNuevo: 'ADMIN_LOCAL',
      aplicado: false,
    };
    if (preview) {
      await client.query('ROLLBACK');
      return result;
    }
    if (options.modo === 'ASIGNAR') {
      await client.query(
        'UPDATE "public"."Usuario" SET id_rol = $1 WHERE id_usuario = $2',
        [local.id_rol, existing.id_usuario],
      );
    } else {
      const password = env.LOCAL_ADMIN_PASSWORD;
      if (
        typeof password !== 'string' ||
        password.length < 8 ||
        Buffer.byteLength(password, 'utf8') > 72
      )
        throw new ProvisionError(
          'Define LOCAL_ADMIN_PASSWORD de 8 caracteres mínimo y 72 bytes máximo; no se acepta por argumento.',
        );
      const hash = await bcrypt.hash(password, 12);
      const created = await client.query(
        `
        INSERT INTO "public"."Usuario" (id_empleado_usuario, id_rol, email_usuario, area, password_usuario)
        VALUES ($1, $2, $3, $4, $5) RETURNING id_usuario
      `,
        [empleado.id_empleado, local.id_rol, options.email, options.area, hash],
      );
      result.usuarioId = created.rows[0].id_usuario;
    }
    await client.query('COMMIT');
    result.aplicado = true;
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

function help() {
  process.stdout
    .write(`Provisión de ADMIN_LOCAL. Sin --confirmar solo diagnostica y no modifica nada.

Asignar a un usuario existente del área:
  node scripts/provision-local-admin.cjs --email <email> --area RESTAURANTE
  Añadir --confirmar ASIGNAR_ADMIN_LOCAL para aplicar.

Crear acceso para un empleado existente, activo y del área:
  node scripts/provision-local-admin.cjs --email <email> --area PANADERIA --empleado-id <id>
  Define LOCAL_ADMIN_PASSWORD en el entorno y añade --confirmar CREAR_ADMIN_LOCAL para aplicar.
  No crea empleados ni imprime contraseñas, hashes o credenciales de conexión.

Para una base remota es obligatorio añadir --permitir-remoto.
No cambia el área ni el historial existente y protege al último administrador global.
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return help();
  require('dotenv').config({
    path: path.join(__dirname, '..', '.env'),
    quiet: true,
  });
  const client = new Client({
    connectionString: connectionString(process.env, options),
    connectionTimeoutMillis: 10000,
    statement_timeout: 10000,
  });
  await client.connect();
  try {
    const result = await provision(client, options);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (!result.aplicado)
      process.stdout.write(
        'Simulación: no se hicieron cambios. Revisa el destino antes de confirmar.\n',
      );
  } finally {
    await client.end();
  }
}

module.exports = { parseArgs, connectionString, provision, ProvisionError };
if (require.main === module)
  main().catch((error) => {
    process.stderr.write(
      (error instanceof ProvisionError
        ? error.message
        : 'No se completó la provisión; revisa conexión, migraciones y duplicados sin compartir credenciales.') +
        '\n',
    );
    process.exitCode = 1;
  });
