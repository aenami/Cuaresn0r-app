// Después de pnpm build. Nunca modifica la base configurada: todos los datos,
// migraciones y peticiones viven en una base temporal LOCAL validada.
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
  const configured = new URL(process.env.DATABASE_URL);
  assert(
    ['localhost', '127.0.0.1'].includes(configured.hostname),
    'Solo PostgreSQL local',
  );
  const name = `pos_inventory_valuation_${Date.now()}`;
  assert.match(name, /^pos_inventory_valuation_\d+$/);
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
    const migration = spawnSync(
      process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
      ['exec', 'prisma', 'migrate', 'deploy'],
      {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, DATABASE_URL: scratchUrl.toString() },
        stdio: 'inherit',
        shell: process.platform === 'win32',
      },
    );
    assert.equal(migration.status, 0, 'Migración temporal fallida');
    process.env.DATABASE_URL = scratchUrl.toString();
    process.env.JWT_SECRET = crypto.randomBytes(32).toString('base64');
    const { NestFactory } = require('@nestjs/core');
    const { ValidationPipe } = require('@nestjs/common');
    const { AppModule } = require('../dist/src/app.module');
    const { PrismaService } = require('../dist/src/prisma/prisma.service');
    const { TokenService } = require('../dist/src/common/token/token.service');
    const {
      fechaColombia,
    } = require('../dist/src/recipes/inventory-reconciliation');
    app = await NestFactory.create(AppModule, { logger: ['error'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const prisma = app.get(PrismaService);
    const tokens = app.get(TokenService);
    async function usuario(rol, area) {
      const r = await prisma.rol.upsert({
        where: { nombre_rol: rol },
        update: {},
        create: { nombre_rol: rol },
      });
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
          id_rol: r.id_rol,
          email_usuario: `${rol}-${area}@test.invalid`,
          password_usuario: 'fixture-no-login',
          area,
        },
      });
      return {
        ...u,
        token: tokens.generateToken(u.id_usuario, u.id_rol, rol, area),
      };
    }
    const owner = await usuario('ADMIN_GLOBAL', 'RESTAURANTE');
    const adminRest = await usuario('ADMIN_LOCAL', 'RESTAURANTE');
    const adminPan = await usuario('ADMIN_LOCAL', 'PANADERIA');
    const cashRest = await usuario('CAJERO', 'RESTAURANTE');
    const cashPan = await usuario('CAJERO', 'PANADERIA');
    const panadero = await usuario('PANADERO', 'PANADERIA');
    let checks = 0;
    async function pedir(
      u,
      ruta,
      method = 'GET',
      body,
      status = 200,
      area = u.area,
    ) {
      const respuesta = await fetch(`${base}${ruta}`, {
        method,
        headers: {
          Authorization: `Bearer ${u.token}`,
          'Content-Type': 'application/json',
          'X-Area-Negocio': area,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      const datos = await respuesta.json();
      assert.equal(
        respuesta.status,
        status,
        `${method} ${ruta}: ${respuesta.status} ${JSON.stringify(datos)}`,
      );
      checks++;
      return datos;
    }
    const fecha = fechaColombia().toISOString().slice(0, 10);
    const mes = fecha.slice(0, 7);
    const mensual = (area) =>
      pedir(
        owner,
        `/recipes/inventory-valuation/monthly?month=${mes}`,
        'GET',
        undefined,
        200,
        area,
      );
    const producto = await prisma.producto.create({
      data: { nombre_producto: 'Agua valoración REST', precio_producto: 2500 },
    });
    const ingrediente = await pedir(
      adminRest,
      '/recipes/ingredients',
      'POST',
      { name: 'Queso valoración', stock: 3.75, units: 'kg', price: 12000 },
      201,
    );
    const pedido = await prisma.pedido.create({
      data: { mesero_pedido: cashRest.id_usuario },
    });
    const comanda = await prisma.comanda.create({
      data: {
        id_pedido_comanda: pedido.id_pedido,
        estado_comanda: 'ENVIADA',
        fecha_envio_comanda: new Date(),
      },
    });
    const detalle = await prisma.detalleComanda.create({
      data: {
        id_comanda_dc: comanda.id_comanda,
        id_producto_dc: producto.id_producto,
        cantidad_producto_dc: 7,
        precio_unitario_dc: 2500,
        estado_dc: 'ENTREGADO',
        fecha_entrega_dc: new Date(),
      },
    });
    await prisma.movimientoInventario.create({
      data: {
        id_ingrediente_movimiento: ingrediente.id_ingrediente,
        id_detalleComanda_movimiento: detalle.id_detalleComanda,
        tipo_movimiento: 'SALIDA_RECETA',
        cantidad_movimiento: 1.25,
      },
    });
    const conteo = await pedir(
      adminRest,
      '/recipes/inventory-counts',
      'POST',
      {
        fecha,
        tipo: 'PRODUCTO',
        idObjetivo: producto.id_producto,
        cantidadInicial: 20,
      },
      201,
    );
    const antesFacturas = await prisma.factura.count();
    const antesPagos = await prisma.pago.count();
    const terminado = await pedir(
      cashRest,
      `/recipes/inventory-counts/${conteo.id_conteoInventario}/finalize`,
      'PATCH',
      { cantidadFisica: 10 },
    );
    assert.equal(terminado.valoracion.ingresoEstimado, '17500');
    assert.equal(terminado.valoracion.perdidaEstimada, '7500');
    assert.equal(terminado.valoracion.cantidadFaltante, '3');
    assert.equal(await prisma.factura.count(), antesFacturas);
    assert.equal(await prisma.pago.count(), antesPagos);
    const guardado = await prisma.conteoInventarioDiario.findUniqueOrThrow({
      where: { id_conteoInventario: conteo.id_conteoInventario },
    });
    assert.equal(guardado.valoracion.precioReferencia, '2500');
    await prisma.producto.update({
      where: { id_producto: producto.id_producto },
      data: { precio_producto: 5000 },
    });
    const restAntes = await mensual('RESTAURANTE');
    assert.equal(restAntes.totales.ingresoEstimado, '17500');
    assert.equal(restAntes.totales.perdidaProductos, '7500');
    assert.equal((await mensual('PANADERIA')).filas.length, 0);

    const conteoIngrediente = await pedir(
      adminRest,
      '/recipes/inventory-counts',
      'POST',
      {
        fecha,
        tipo: 'INGREDIENTE',
        idObjetivo: ingrediente.id_ingrediente,
        cantidadInicial: 5,
      },
      201,
    );
    const stockAntes = (
      await prisma.ingrediente.findUniqueOrThrow({
        where: { id_ingrediente: ingrediente.id_ingrediente },
      })
    ).stock_ingrediente.toString();
    const contado = await pedir(
      cashRest,
      `/recipes/inventory-counts/${conteoIngrediente.id_conteoInventario}/finalize`,
      'PATCH',
      { cantidadFisica: 3.5 },
    );
    assert.equal(contado.valoracion.tipoReferencia, 'COSTO_UNITARIO');
    assert.equal(contado.valoracion.costoConsumido, '15000');
    assert.equal(contado.valoracion.ingresoEstimado, '0');
    assert.equal(contado.valoracion.perdidaEstimada, '3000');
    assert.equal(
      (
        await prisma.ingrediente.findUniqueOrThrow({
          where: { id_ingrediente: ingrediente.id_ingrediente },
        })
      ).stock_ingrediente.toString(),
      stockAntes,
    );
    const restAmbos = await mensual('RESTAURANTE');
    assert.equal(restAmbos.totales.ingresoEstimado, '17500');
    assert.equal(restAmbos.totales.costoConsumido, '15000');
    assert.equal(restAmbos.totales.perdidaIngredientes, '3000');
    await pedir(
      adminRest,
      `/recipes/inventory-counts/${conteo.id_conteoInventario}/reopen`,
      'PATCH',
      {},
    );
    assert.equal(
      (
        await prisma.conteoInventarioDiario.findUniqueOrThrow({
          where: { id_conteoInventario: conteo.id_conteoInventario },
        })
      ).valoracion,
      null,
    );
    const reabierto = await mensual('RESTAURANTE');
    assert.equal(reabierto.excluidos.pendientes, 1);
    assert.equal(reabierto.totales.ingresoEstimado, '0');
    await pedir(
      cashRest,
      `/recipes/inventory-counts/${conteo.id_conteoInventario}/finalize`,
      'PATCH',
      { cantidadFisica: 10 },
    );
    const nuevasReferencia = await mensual('RESTAURANTE');
    assert.equal(nuevasReferencia.totales.ingresoEstimado, '35000');
    assert.equal(nuevasReferencia.totales.perdidaProductos, '15000');
    await pedir(
      cashRest,
      `/recipes/ingredients/${ingrediente.id_ingrediente}/movements`,
      'POST',
      { tipo: 'ENTRADA', cantidad: 1 },
      201,
    );
    const invalido = (
      await pedir(cashRest, `/recipes/inventory-counts?date=${fecha}`)
    ).find(
      (c) => c.id_conteoInventario === conteoIngrediente.id_conteoInventario,
    );
    assert.equal(invalido.valoracion.estado, 'RECONTAR');
    assert.equal(invalido.valoracion.costoConsumido, null);
    assert.equal((await mensual('RESTAURANTE')).excluidos.recontar, 1);

    const caja = await prisma.caja.create({
      data: { nombre_caja: 'Caja valoración PAN', area: 'PANADERIA' },
    });
    await pedir(
      cashPan,
      '/billing/turnos',
      'POST',
      { idCaja: caja.id_caja, tipo: 'MANANA' },
      201,
    );
    const agua = await pedir(
      adminPan,
      '/bakery/articulos',
      'POST',
      {
        nombre: 'Agua valoración PAN',
        tipo: 'EXTERNO',
        unidad: 'UNIDADES',
        precioVenta: 2500,
      },
      201,
    );
    const proveedor = await prisma.proveedor.create({
      data: { nombre_proveedor: 'Proveedor temporal', area: 'PANADERIA' },
    });
    const compra = await pedir(
      cashPan,
      '/billing/cuentas-por-pagar',
      'POST',
      {
        idProveedor: proveedor.id_proveedor,
        concepto: 'Recepción valorada',
        montoTotal: 10000,
        detalles: [
          { articuloPanaderiaId: agua.id, cantidad: 10, precioUnitario: 1000 },
        ],
      },
      201,
    );
    assert.equal(
      (
        await prisma.articuloPanaderia.findUniqueOrThrow({
          where: { id: agua.id },
        })
      ).existencia.toString(),
      '0',
    );
    await pedir(
      cashPan,
      `/billing/cuentas-por-pagar/${compra.id_cuentaPorPagar}/recibir`,
      'PATCH',
      {},
    );
    await pedir(
      cashPan,
      '/bakery/ventas',
      'POST',
      {
        claveOperacion: crypto.randomUUID(),
        lineas: [{ articuloId: agua.id, cantidad: 7 }],
        pagos: [{ metodo: 'EFECTIVO', monto: 17500 }],
      },
      201,
    );
    const numeroVentas = await prisma.ventaPanaderia.count();
    const contadoAgua = await pedir(
      cashPan,
      `/bakery/conteo/${agua.id}`,
      'POST',
      { cantidadFisica: 0 },
      201,
    );
    assert.equal(contadoAgua.valoracion.ingresoEstimado, '17500');
    assert.equal(contadoAgua.valoracion.perdidaEstimada, '7500');
    assert.equal(
      (
        await prisma.articuloPanaderia.findUniqueOrThrow({
          where: { id: agua.id },
        })
      ).existencia.toString(),
      '3',
    );
    assert.equal(await prisma.ventaPanaderia.count(), numeroVentas);
    await pedir(adminPan, `/bakery/articulos/${agua.id}`, 'PATCH', {
      precioVenta: 5000,
    });
    const panPrecioAntiguo = await mensual('PANADERIA');
    assert.equal(panPrecioAntiguo.totales.ingresoEstimado, '17500');
    assert.equal(panPrecioAntiguo.totales.perdidaProductos, '7500');
    assert(
      panPrecioAntiguo.filas.every((f) => f.nombre !== 'Agua valoración REST'),
    );
    const harina = await pedir(
      adminPan,
      '/bakery/articulos',
      'POST',
      {
        nombre: 'Harina valoración',
        tipo: 'INSUMO',
        unidad: 'kg',
        precioVenta: 0,
        costoReferencia: 15000,
      },
      201,
    );
    const pan = await pedir(
      adminPan,
      '/bakery/articulos',
      'POST',
      {
        nombre: 'Pan valoración',
        tipo: 'PANADERIA',
        unidad: 'UNIDADES',
        precioVenta: 2000,
      },
      201,
    );
    await pedir(
      panadero,
      `/bakery/articulos/${harina.id}/entradas`,
      'POST',
      { cantidad: 2.5, concepto: 'Harina recibida' },
      201,
    );
    await pedir(
      adminPan,
      '/bakery/recetas',
      'POST',
      {
        articuloId: pan.id,
        nombre: 'Receta valorada',
        detalles: [{ insumoId: harina.id, cantidadUnidad: 0.1 }],
      },
      201,
    );
    await pedir(
      panadero,
      `/bakery/articulos/${pan.id}/entradas`,
      'POST',
      { cantidad: 10, concepto: 'Hornada valorada' },
      201,
    );
    const conteoHarina = await pedir(
      panadero,
      `/bakery/conteo/${harina.id}`,
      'POST',
      { cantidadFisica: 1.25 },
      201,
    );
    assert.equal(conteoHarina.valoracion.costoConsumido, '15000');
    assert.equal(conteoHarina.valoracion.perdidaEstimada, '3750');
    assert.equal(conteoHarina.valoracion.ingresoEstimado, '0');
    const panAmbos = await mensual('PANADERIA');
    assert.equal(panAmbos.totales.costoConsumido, '15000');
    assert.equal(panAmbos.totales.ingresoEstimado, '17500');
    assert.equal(panAmbos.totales.perdidaIngredientes, '3750');
    await pedir(adminPan, `/bakery/articulos/${harina.id}`, 'PATCH', {
      costoReferencia: null,
    });
    await pedir(
      panadero,
      `/bakery/conteo/${harina.id}`,
      'POST',
      { cantidadFisica: 1.25 },
      201,
    );
    const sinReferencia = await mensual('PANADERIA');
    assert.equal(sinReferencia.excluidos.sinReferencia, 1);
    assert.equal(sinReferencia.totales.costoConsumido, '0');
    await pedir(
      cashPan,
      `/bakery/articulos/${agua.id}/mermas`,
      'POST',
      { cantidad: 1, concepto: 'Merma declarada posterior' },
      201,
    );
    const vistaPan = await pedir(cashPan, '/bakery/conteo');
    assert.equal(
      vistaPan.detalle.find((c) => c.articuloId === agua.id).valoracion.estado,
      'RECONTAR',
    );
    const excluidoPan = await mensual('PANADERIA');
    assert.equal(excluidoPan.excluidos.recontar, 1);
    assert.equal(excluidoPan.totales.ingresoEstimado, '0');

    // La ausencia histórica se conserva; ni el precio actual ni un sobrante
    // histórico se inventan como dinero ingresado.
    const sinHistoria = await prisma.articuloPanaderia.create({
      data: {
        nombre: 'Historia sin valoración',
        tipo: 'EXTERNO',
        precioVenta: 3000,
      },
    });
    await prisma.conteoPanaderia.create({
      data: {
        articuloId: sinHistoria.id,
        usuarioId: cashPan.id_usuario,
        fecha: new Date(fecha),
        cantidadInicial: 2,
        entradas: 0,
        ventasRegistradas: 0,
        transferencias: 0,
        mermas: 0,
        cantidadFisica: 2,
        precioReferencia: 1000,
      },
    });
    assert.equal((await mensual('PANADERIA')).excluidos.sinValoracion, 1);
    await pedir(
      cashPan,
      `/recipes/inventory-valuation/monthly?month=${mes}`,
      'GET',
      undefined,
      403,
    );
    await pedir(
      adminPan,
      `/recipes/inventory-valuation/monthly?month=${mes}`,
      'GET',
      undefined,
      403,
      'RESTAURANTE',
    );
    await pedir(
      owner,
      '/recipes/inventory-valuation/monthly?month=2026-13',
      'GET',
      undefined,
      400,
      'PANADERIA',
    );
    const destinos = await pedir(owner, '/recipes/inventory-counts/targets');
    assert(destinos.some((p) => p.id_producto === producto.id_producto));
    assert(destinos.every((p) => !('precio_producto' in p)));
    process.stdout.write(
      `Valoración API real: ${checks} comprobaciones HTTP y snapshots persistidos correctos.\n`,
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
