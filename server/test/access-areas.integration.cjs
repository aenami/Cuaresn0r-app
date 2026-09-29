// Ejecutar después de pnpm build. Solo crea y elimina una base temporal local.
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { Client } = require('pg');
require('dotenv').config({
  path: path.join(__dirname, '..', '.env'),
  quiet: true,
});

async function main() {
  const diario = process.argv.includes('--dia');
  const configured = new URL(process.env.DATABASE_URL);
  if (!['localhost', '127.0.0.1'].includes(configured.hostname))
    throw new Error('Solo PostgreSQL local');
  const name = `pos_access_verify_${Date.now()}`;
  assert.match(name, /^pos_access_verify_\d+$/);
  const maintenanceUrl = new URL(configured);
  maintenanceUrl.pathname = '/postgres';
  const scratchUrl = new URL(configured);
  scratchUrl.pathname = `/${name}`;
  const maintenance = new Client({
    connectionString: maintenanceUrl.toString(),
  });
  await maintenance.connect();
  let created = false;
  let app;
  try {
    await maintenance.query(`CREATE DATABASE "${name}"`);
    created = true;
    const result = spawnSync(
      process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
      ['exec', 'prisma', 'migrate', 'deploy'],
      {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, DATABASE_URL: scratchUrl.toString() },
        stdio: 'inherit',
        shell: process.platform === 'win32',
      },
    );
    assert.equal(result.status, 0, 'Migración temporal fallida');
    process.env.DATABASE_URL = scratchUrl.toString();
    process.env.JWT_SECRET = crypto.randomBytes(32).toString('base64');
    const { NestFactory } = require('@nestjs/core');
    const { ValidationPipe } = require('@nestjs/common');
    const { AppModule } = require('../dist/src/app.module');
    const { PrismaService } = require('../dist/src/prisma/prisma.service');
    const { TokenService } = require('../dist/src/common/token/token.service');
    app = await NestFactory.create(AppModule, { logger: ['error'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const prisma = app.get(PrismaService);
    const tokens = app.get(TokenService);
    const roles = {};
    for (const rol of [
      'ADMIN_GLOBAL',
      'ADMIN_LOCAL',
      'CAJERO',
      'MESERO',
      'COCINERO',
      'PANADERO',
    ]) {
      roles[rol] = await prisma.rol.upsert({
        where: { nombre_rol: rol },
        update: {},
        create: { nombre_rol: rol },
      });
    }
    async function usuario(rol, area, email) {
      const empleado = await prisma.empleado.create({
        data: {
          nombre_empleado: rol,
          apellido_empleado: area,
          area,
          fecha_ingreso_empleado: new Date(),
        },
      });
      const u = await prisma.usuario.create({
        data: {
          id_empleado_usuario: empleado.id_empleado,
          id_rol: roles[rol].id_rol,
          email_usuario: email,
          password_usuario: 'fixture-no-login',
          area,
        },
      });
      return {
        ...u,
        token: tokens.generateToken(u.id_usuario, u.id_rol, rol, area),
      };
    }
    const global = await usuario(
      'ADMIN_GLOBAL',
      'RESTAURANTE',
      'global@test.invalid',
    );
    const adminPan = await usuario(
      'ADMIN_LOCAL',
      'PANADERIA',
      'adminpan@test.invalid',
    );
    const adminRest = await usuario(
      'ADMIN_LOCAL',
      'RESTAURANTE',
      'adminrest@test.invalid',
    );
    const cajPan = await usuario('CAJERO', 'PANADERIA', 'cajpan@test.invalid');
    const cajRest = await usuario(
      'CAJERO',
      'RESTAURANTE',
      'cajrest@test.invalid',
    );
    const panadero = await usuario(
      'PANADERO',
      'PANADERIA',
      'panadero@test.invalid',
    );
    const mesero = await usuario(
      'MESERO',
      'RESTAURANTE',
      'mesero@test.invalid',
    );
    const cocinero = await usuario(
      'COCINERO',
      'RESTAURANTE',
      'cocinero@test.invalid',
    );
    let checks = 0;
    async function pedir(
      u,
      ruta,
      metodo = 'GET',
      datos,
      expected = 200,
      area = u.area,
    ) {
      const res = await fetch(`${base}${ruta}`, {
        method: metodo,
        headers: {
          Authorization: `Bearer ${u.token}`,
          'Content-Type': 'application/json',
          'X-Area-Negocio': area,
        },
        ...(datos !== undefined && { body: JSON.stringify(datos) }),
      });
      const body = await res.json();
      assert.equal(
        res.status,
        expected,
        `${metodo} ${ruta}: ${res.status} ${JSON.stringify(body)}`,
      );
      checks++;
      return body;
    }
    for (const u of [
      adminPan,
      adminRest,
      cajPan,
      cajRest,
      panadero,
      mesero,
      cocinero,
    ])
      await pedir(u, '/payroll/me/resumen');
    await pedir(
      global,
      '/payroll/me/resumen',
      'GET',
      undefined,
      403,
      'PANADERIA',
    );
    for (const area of ['RESTAURANTE', 'PANADERIA']) {
      const perfilGlobal = await pedir(
        global,
        '/auth/usuarios/me',
        'GET',
        undefined,
        200,
        area,
      );
      assert.equal(perfilGlobal.rol.nombre_rol, 'ADMIN_GLOBAL');
      for (const [ruta, metodo] of [
        ['/auth/usuarios', 'GET'],
        ['/auth/roles', 'GET'],
        ['/auth/empleados', 'GET'],
        ['/payroll/me/resumen', 'GET'],
        ['/payroll/empleados/1/saldo', 'GET'],
        ['/catalog/products', 'GET'],
        ['/printing/impresoras', 'GET'],
        ['/printing/comandas/1/reimprimir', 'POST'],
        ['/bakery/articulos', 'POST'],
        ['/bakery/articulos/1', 'PATCH'],
      ])
        await pedir(
          global,
          ruta,
          metodo,
          metodo === 'GET' ? undefined : {},
          403,
          area,
        );
      for (const ruta of [
        '/billing/turnos',
        '/billing/proveedores',
        '/billing/cuentas-por-pagar',
        '/bakery/remisiones',
      ])
        await pedir(global, ruta, 'GET', undefined, 200, area);
    }
    for (const ruta of [
      '/billing/turnos',
      '/billing/facturas',
      '/billing/facturas/1/pagos',
      '/bakery/ventas',
      '/bakery/remisiones/entregas',
      '/billing/cuentas-por-pagar/1/pagos',
      '/payroll/empleados/1/pagos',
    ])
      await pedir(global, ruta, 'POST', {}, 403);
    await pedir(global, '/orders', 'GET', undefined, 403);
    await pedir(
      adminPan,
      '/auth/empleados',
      'GET',
      undefined,
      403,
      'RESTAURANTE',
    );
    await pedir(
      adminPan,
      `/auth/empleados/${adminRest.id_empleado_usuario}`,
      'GET',
      undefined,
      403,
    );
    await pedir(adminPan, '/catalog/products', 'GET', undefined, 403);
    await pedir(adminRest, '/bakery/articulos', 'GET', undefined, 403);
    await pedir(mesero, '/auth/empleados', 'GET', undefined, 403);
    await pedir(panadero, '/billing/proveedores', 'GET', undefined, 403);
    await pedir(panadero, '/bakery/ventas', 'POST', {}, 403);
    await pedir(
      adminPan,
      '/auth/usuarios',
      'POST',
      {
        idEmpleado: panadero.id_empleado_usuario,
        idRol: roles.ADMIN_GLOBAL.id_rol,
        email: 'escalado@test.invalid',
        password: 'PruebaTemporal123',
        area: 'PANADERIA',
      },
      403,
    );
    const empleadosPan = await pedir(adminPan, '/auth/empleados');
    assert(empleadosPan.every((e) => e.area === 'PANADERIA'));
    const usuariosPan = await pedir(adminPan, '/auth/usuarios');
    assert(
      usuariosPan.every(
        (u) => u.area === 'PANADERIA' && u.rol.nombre_rol !== 'ADMIN_GLOBAL',
      ),
    );
    const provPan = await pedir(
      cajPan,
      '/billing/proveedores',
      'POST',
      { nombre: 'Proveedor compartido' },
      201,
    );
    const provRest = await pedir(
      cajRest,
      '/billing/proveedores',
      'POST',
      { nombre: 'Proveedor compartido' },
      201,
    );
    assert.notEqual(provPan.id_proveedor, provRest.id_proveedor);
    const cajaPan = await prisma.caja.create({
      data: { nombre_caja: 'Pan prueba', area: 'PANADERIA' },
    });
    const cajaRest = await prisma.caja.create({
      data: { nombre_caja: 'Rest prueba', area: 'RESTAURANTE' },
    });
    const turnoPan = await pedir(
      cajPan,
      '/billing/turnos',
      'POST',
      { idCaja: cajaPan.id_caja, tipo: 'MANANA' },
      201,
    );
    await pedir(
      cajRest,
      '/billing/turnos',
      'POST',
      { idCaja: cajaRest.id_caja, tipo: 'MANANA' },
      201,
    );
    const actual = await pedir(cajPan, '/billing/turnos/actual');
    assert.equal(actual.id_turno, turnoPan.id_turno);
    const pan = await pedir(
      adminPan,
      '/bakery/articulos',
      'POST',
      {
        nombre: 'Pan prueba',
        tipo: 'PANADERIA',
        unidad: 'UNIDADES',
        precioVenta: 2000,
      },
      201,
    );
    const postre = await pedir(
      adminPan,
      '/bakery/articulos',
      'POST',
      {
        nombre: 'Postre prueba',
        tipo: 'PASTELERIA',
        unidad: 'UNIDADES',
        precioVenta: 4000,
      },
      201,
    );
    const harina = await pedir(
      adminPan,
      '/bakery/articulos',
      'POST',
      { nombre: 'Harina prueba', tipo: 'INSUMO', unidad: 'kg', precioVenta: 0 },
      201,
    );
    const agua = await pedir(
      adminPan,
      '/bakery/articulos',
      'POST',
      {
        nombre: 'Agua prueba',
        tipo: 'EXTERNO',
        unidad: 'UNIDADES',
        precioVenta: 3000,
      },
      201,
    );
    await pedir(
      panadero,
      `/bakery/articulos/${harina.id}/entradas`,
      'POST',
      { cantidad: 5, concepto: 'Insumo recibido' },
      201,
    );
    await pedir(
      adminPan,
      '/bakery/recetas',
      'POST',
      {
        articuloId: pan.id,
        nombre: 'Receta pan',
        detalles: [{ insumoId: harina.id, cantidadUnidad: 0.1 }],
      },
      201,
    );
    await pedir(
      panadero,
      `/bakery/articulos/${pan.id}/entradas`,
      'POST',
      { cantidad: 10, concepto: 'Hornada' },
      201,
    );
    await pedir(
      cajPan,
      `/bakery/articulos/${pan.id}/entradas`,
      'POST',
      { cantidad: 1, concepto: 'Hornada indebida' },
      403,
    );
    await pedir(
      panadero,
      `/bakery/articulos/${agua.id}/entradas`,
      'POST',
      { cantidad: 1, concepto: 'Entrada indebida' },
      403,
    );
    const cuentaPan = await pedir(
      cajPan,
      '/billing/cuentas-por-pagar',
      'POST',
      {
        idProveedor: provPan.id_proveedor,
        concepto: 'Bebidas',
        montoTotal: 5000,
        detalles: [
          { articuloPanaderiaId: agua.id, cantidad: 5, precioUnitario: 1000 },
        ],
      },
      201,
    );
    await pedir(
      cajRest,
      `/billing/cuentas-por-pagar/${cuentaPan.id_cuentaPorPagar}`,
      'GET',
      undefined,
      403,
    );
    await pedir(
      cajPan,
      `/billing/cuentas-por-pagar/${cuentaPan.id_cuentaPorPagar}/recibir`,
      'PATCH',
      {},
      200,
    );
    assert.equal(
      (
        await prisma.articuloPanaderia.findUniqueOrThrow({
          where: { id: agua.id },
        })
      ).existencia.toString(),
      '5',
    );
    const destino = await prisma.ingrediente.create({
      data: {
        nombre_ingrediente: 'Pan recibido',
        unidades_ingrediente: 'UNIDADES',
        stock_ingrediente: 0,
        precio_ingrediente: 2000,
      },
    });
    const entrega = {
      claveOperacion: crypto.randomUUID(),
      modalidad: diario ? 'DIA' : 'TURNO',
      articuloId: pan.id,
      ingredienteDestinoId: destino.id_ingrediente,
      cantidad: 2,
      precioUnitario: 2000,
      concepto: 'Entregado físicamente',
    };
    const remision = await pedir(
      cajPan,
      '/bakery/remisiones/entregas',
      'POST',
      entrega,
      201,
    );
    const repetida = await pedir(
      cajPan,
      '/bakery/remisiones/entregas',
      'POST',
      entrega,
      201,
    );
    assert.equal(remision.id, repetida.id);
    assert.equal(repetida.detalles.length, 1);
    const segunda = await pedir(
      cajPan,
      '/bakery/remisiones/entregas',
      'POST',
      { ...entrega, claveOperacion: crypto.randomUUID(), cantidad: 3 },
      201,
    );
    assert.equal(segunda.id, remision.id);
    assert.equal(segunda.montoTotal, '10000');
    assert.equal(
      (
        await prisma.ingrediente.findUniqueOrThrow({
          where: { id_ingrediente: destino.id_ingrediente },
        })
      ).stock_ingrediente.toString(),
      '5',
    );
    await pedir(
      cajPan,
      '/bakery/remisiones/entregas',
      'POST',
      {
        ...entrega,
        claveOperacion: crypto.randomUUID(),
        modalidad: diario ? 'TURNO' : 'DIA',
      },
      409,
    );
    let operador = cajPan;
    let turnoOperacion = turnoPan;
    let totalRemision = 10000;
    if (diario) {
      // Un turno heredado sin clasificación tampoco puede cerrar el día.
      await prisma.turno.update({
        where: { id_turno: turnoPan.id_turno },
        data: { tipo_turno: null },
      });
      await pedir(
        cajPan,
        `/bakery/remisiones/${remision.id}/cerrar`,
        'POST',
        {},
        409,
      );
      await prisma.turno.update({
        where: { id_turno: turnoPan.id_turno },
        data: { tipo_turno: 'MANANA' },
      });
      await pedir(
        cajPan,
        `/bakery/remisiones/${remision.id}/cerrar`,
        'POST',
        {},
        409,
      );
      await pedir(
        cajPan,
        `/billing/turnos/${turnoPan.id_turno}/cerrar`,
        'PATCH',
        { montoCierreReal: 300000 },
        200,
      );
      operador = await usuario('CAJERO', 'PANADERIA', 'noche@test.invalid');
      turnoOperacion = await pedir(
        operador,
        '/billing/turnos',
        'POST',
        { idCaja: cajaPan.id_caja, tipo: 'TARDE_NOCHE' },
        201,
      );
      const acumulada = await pedir(
        operador,
        '/bakery/remisiones/entregas',
        'POST',
        { ...entrega, claveOperacion: crypto.randomUUID(), cantidad: 1 },
        201,
      );
      assert.equal(
        acumulada.id,
        remision.id,
        'La remisión diaria debe acumular ambos turnos',
      );
      assert.equal(acumulada.detalles.length, 3);
      totalRemision = 12000;
    }
    await pedir(
      operador,
      `/billing/turnos/${turnoOperacion.id_turno}/cerrar`,
      'PATCH',
      { montoCierreReal: 300000 },
      409,
    );
    const cerrada = await pedir(
      operador,
      `/bakery/remisiones/${remision.id}/cerrar`,
      'POST',
      {},
      201,
    );
    await pedir(
      operador,
      '/bakery/remisiones/entregas',
      'POST',
      { ...entrega, claveOperacion: crypto.randomUUID() },
      409,
    );
    await pedir(
      cajRest,
      `/billing/cuentas-por-pagar/${cerrada.cuentaPorPagarId}/pagos`,
      'POST',
      { metodo: 'EFECTIVO', monto: 2000 },
      409,
    );
    await pedir(
      cajRest,
      `/billing/cuentas-por-pagar/${cerrada.cuentaPorPagarId}/pagos`,
      'POST',
      { metodo: 'EFECTIVO', monto: totalRemision },
      201,
    );
    await pedir(
      operador,
      `/bakery/remisiones/${remision.id}/confirmar-ingreso`,
      'POST',
      {},
      201,
    );
    await pedir(
      operador,
      `/bakery/remisiones/${remision.id}/confirmar-ingreso`,
      'POST',
      {},
      409,
    );
    const resumen = await pedir(operador, '/billing/turnos/actual');
    assert.equal(
      Number(resumen.resumenCuadre.efectivo.esperadoConBase),
      300000 + totalRemision,
    );
    const resumenRest = await pedir(cajRest, '/billing/turnos/actual');
    assert.equal(
      Number(resumenRest.resumenCuadre.efectivo.esperadoConBase),
      300000 - totalRemision,
    );
    if (diario) {
      for (const articulo of await prisma.articuloPanaderia.findMany({
        where: { activo: true },
      }))
        await pedir(
          operador,
          `/bakery/conteo/${articulo.id}`,
          'POST',
          { cantidadFisica: Number(articulo.existencia) },
          201,
        );
    }
    await pedir(
      operador,
      `/billing/turnos/${turnoOperacion.id_turno}/cerrar`,
      'PATCH',
      { montoCierreReal: 300000 + totalRemision },
      200,
    );
    // Sesiones anteriores dejan de tener privilegios de inmediato.
    await prisma.usuario.update({
      where: { id_usuario: adminPan.id_usuario },
      data: { id_rol: roles.PANADERO.id_rol },
    });
    await pedir(adminPan, '/auth/usuarios', 'GET', undefined, 403);
    const perfil = await pedir(adminPan, '/auth/usuarios/me');
    assert.equal(perfil.rol.nombre_rol, 'PANADERO');
    assert.equal(postre.tipo, 'PASTELERIA');
    // Provisión de administradores locales solamente en esta base temporal.
    const {
      parseArgs,
      connectionString,
      provision,
      ProvisionError,
    } = require('../scripts/provision-local-admin.cjs');
    const cliDb = new Client({ connectionString: scratchUrl.toString() });
    await cliDb.connect();
    try {
      const candidato = await usuario(
        'CAJERO',
        'PANADERIA',
        'bootstrap@test.invalid',
      );
      const opciones = parseArgs([
        '--email',
        candidato.email_usuario,
        '--area',
        'PANADERIA',
      ]);
      const simulacion = await provision(cliDb, opciones);
      assert.equal(simulacion.aplicado, false);
      assert.equal(
        (
          await prisma.usuario.findUniqueOrThrow({
            where: { id_usuario: candidato.id_usuario },
          })
        ).id_rol,
        roles.CAJERO.id_rol,
        'La simulación no debe asignar el rol',
      );
      assert.throws(
        () =>
          parseArgs([
            '--email',
            candidato.email_usuario,
            '--area',
            'PANADERIA',
            '--confirmar',
            'CREAR_ADMIN_LOCAL',
          ]),
        ProvisionError,
      );
      assert.throws(
        () =>
          connectionString(
            {
              DATABASE_URL:
                'postgresql://fixture:fixture@example.invalid/fixture',
            },
            opciones,
          ),
        ProvisionError,
      );
      await assert.rejects(
        () =>
          provision(cliDb, {
            ...opciones,
            area: 'RESTAURANTE',
            confirmar: true,
          }),
        ProvisionError,
      );
      await assert.rejects(
        () =>
          provision(
            cliDb,
            parseArgs([
              '--email',
              global.email_usuario,
              '--area',
              'RESTAURANTE',
              '--confirmar',
              'ASIGNAR_ADMIN_LOCAL',
            ]),
          ),
        ProvisionError,
      );
      assert.equal(
        (
          await prisma.usuario.findUniqueOrThrow({
            where: { id_usuario: global.id_usuario },
          })
        ).id_rol,
        roles.ADMIN_GLOBAL.id_rol,
        'La provisión debe proteger al último global',
      );
      const asignacion = await provision(cliDb, {
        ...opciones,
        confirmar: true,
      });
      assert.equal(asignacion.aplicado, true);
      const asignado = await prisma.usuario.findUniqueOrThrow({
        where: { id_usuario: candidato.id_usuario },
      });
      assert.equal(asignado.id_rol, roles.ADMIN_LOCAL.id_rol);
      assert.equal(asignado.area, candidato.area);
      assert.equal(asignado.id_empleado_usuario, candidato.id_empleado_usuario);
      assert.equal(asignado.password_usuario, candidato.password_usuario);
      const empleadoNuevo = await prisma.empleado.create({
        data: {
          nombre_empleado: 'Bootstrap temporal',
          apellido_empleado: 'Panadería',
          area: 'PANADERIA',
          fecha_ingreso_empleado: new Date(),
        },
      });
      const opcionesCrear = parseArgs([
        '--email',
        'bootstrap-nuevo@test.invalid',
        '--area',
        'PANADERIA',
        '--empleado-id',
        String(empleadoNuevo.id_empleado),
        '--confirmar',
        'CREAR_ADMIN_LOCAL',
      ]);
      await assert.rejects(
        () => provision(cliDb, opcionesCrear, {}),
        ProvisionError,
      );
      assert.equal(
        await prisma.usuario.count({
          where: { email_usuario: 'bootstrap-nuevo@test.invalid' },
        }),
        0,
      );
      const passwordTemporal = crypto.randomBytes(24).toString('base64');
      const creado = await provision(cliDb, opcionesCrear, {
        LOCAL_ADMIN_PASSWORD: passwordTemporal,
      });
      assert.equal(creado.aplicado, true);
      const usuarioNuevo = await prisma.usuario.findUniqueOrThrow({
        where: { id_usuario: creado.usuarioId },
      });
      assert.equal(usuarioNuevo.id_rol, roles.ADMIN_LOCAL.id_rol);
      assert.equal(usuarioNuevo.area, 'PANADERIA');
      assert.equal(usuarioNuevo.id_empleado_usuario, empleadoNuevo.id_empleado);
      assert(
        await require('bcrypt').compare(
          passwordTemporal,
          usuarioNuevo.password_usuario,
        ),
      );
      assert(!JSON.stringify(creado).includes(passwordTemporal));
      await assert.rejects(
        () =>
          provision(cliDb, opcionesCrear, {
            LOCAL_ADMIN_PASSWORD: passwordTemporal,
          }),
        ProvisionError,
      );
      process.stdout.write(
        'Provisión CLI temporal: simulación, asignación, creación y protecciones correctas.\n',
      );
    } finally {
      await cliDb.end();
    }
    process.stdout.write(
      `API real ${diario ? 'DIA' : 'TURNO'}: ${checks} verificaciones de roles, áreas, proveedores, producción, remisiones y caja correctas.\n`,
    );
  } finally {
    if (app) await app.close();
    if (created) {
      await maintenance.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
        [name],
      );
      await maintenance.query(`DROP DATABASE "${name}"`);
    }
    await maintenance.end();
  }
}
main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
