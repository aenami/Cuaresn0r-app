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
    const {
      crearValoracion,
    } = require('../dist/src/recipes/inventory-valuation');
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
    const rango = (area, desde, hasta, u = owner) =>
      pedir(
        u,
        `/recipes/inventory-valuation/range?from=${desde}&to=${hasta}`,
        'GET',
        undefined,
        200,
        area,
      );
    const inicioSemana = new Date(new Date(fecha).getTime() - 6 * 86400000)
      .toISOString()
      .slice(0, 10);
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
    const restSemana = await rango(
      'RESTAURANTE',
      inicioSemana,
      fecha,
      adminRest,
    );
    assert.equal(restSemana.desde, inicioSemana);
    assert.equal(restSemana.hasta, fecha);
    assert.deepEqual(restSemana.totales, restAmbos.totales);
    assert.deepEqual(restSemana.filas, restAmbos.filas);
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
    const panSemana = await rango('PANADERIA', inicioSemana, fecha, adminPan);
    assert.deepEqual(panSemana.totales, panAmbos.totales);
    assert.deepEqual(panSemana.filas, panAmbos.filas);
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

    // Historial controlado: referencias anteriores al precio actual, días a
    // ambos lados del rango y cambio de año. No registra ventas ni recaudos.
    const productoRango = await prisma.producto.create({
      data: { nombre_producto: 'Rango REST', precio_producto: 9000 },
    });
    const articuloRango = await prisma.articuloPanaderia.create({
      data: {
        nombre: 'Rango PAN',
        tipo: 'EXTERNO',
        precioVenta: 9000,
      },
    });
    const costoRango = await prisma.articuloPanaderia.create({
      data: {
        nombre: 'Costo Rango PAN',
        tipo: 'INSUMO',
        unidad: 'kg',
        precioVenta: 0,
        costoReferencia: 9999,
      },
    });
    const diasRango = [
      ['2024-12-30', 500],
      ['2024-12-31', 3],
      ['2025-01-01', 4],
      ['2025-01-02', 500],
    ];
    for (const [dia, precio] of diasRango) {
      const registrado = new Date(`${dia}T23:00:00Z`);
      const valoracion = crearValoracion({
        tipoReferencia: 'PRECIO_VENTA',
        precioReferencia: precio,
        nombre: 'Rango REST',
        unidad: 'UNIDADES',
        salidaFisica: 2,
        cantidadCorroborada: 1,
        fechaValoracion: registrado,
      });
      await prisma.conteoInventarioDiario.create({
        data: {
          fecha_conteoInventario: new Date(dia),
          tipo_objetivo_conteoInventario: 'PRODUCTO',
          id_producto_conteoInventario: productoRango.id_producto,
          nombre_objetivo_conteoInventario: 'Rango REST',
          unidad_objetivo_conteoInventario: 'UNIDADES',
          cantidad_anterior_conteoInventario: 5,
          cantidad_fisica_conteoInventario: 3,
          cantidad_salida_conteoInventario: 2,
          estado_conteoInventario: 'FINALIZADO',
          id_usuario_crea_conteoInventario: adminRest.id_usuario,
          id_usuario_cierra_conteoInventario: cashRest.id_usuario,
          fecha_finalizacion_conteoInventario: registrado,
          valoracion,
        },
      });
      await prisma.conteoPanaderia.create({
        data: {
          fecha: new Date(dia),
          articuloId: articuloRango.id,
          usuarioId: cashPan.id_usuario,
          cantidadInicial: 5,
          entradas: 0,
          ventasRegistradas: 1,
          transferencias: 0,
          mermas: 0,
          cantidadFisica: 3,
          precioReferencia: precio,
          fechaRegistro: registrado,
          valoracion: { ...valoracion, nombre: 'Rango PAN' },
        },
      });
    }
    const valoracionCosto = crearValoracion({
      tipoReferencia: 'COSTO_UNITARIO',
      precioReferencia: '1234.5678',
      nombre: 'Costo Rango PAN',
      unidad: 'kg',
      salidaFisica: '1.75',
      cantidadCorroborada: '1.25',
      fechaValoracion: new Date('2025-01-01T23:00:00Z'),
    });
    await prisma.conteoPanaderia.create({
      data: {
        fecha: new Date('2025-01-01'),
        articuloId: costoRango.id,
        usuarioId: panadero.id_usuario,
        cantidadInicial: 3,
        entradas: 0,
        ventasRegistradas: 0,
        consumoReceta: 1.25,
        transferencias: 0,
        mermas: 0,
        cantidadFisica: 1.25,
        precioReferencia: '1234.5678',
        fechaRegistro: new Date('2025-01-01T23:00:00Z'),
        valoracion: valoracionCosto,
      },
    });
    const rangoRest = await rango('RESTAURANTE', '2024-12-31', '2025-01-01');
    assert.equal(rangoRest.filas.length, 1);
    assert.equal(rangoRest.filas[0].diasValorados, 2);
    assert.equal(rangoRest.totales.ingresoEstimado, '7');
    assert.equal(rangoRest.totales.perdidaProductos, '7');
    assert.equal(rangoRest.totales.costoConsumido, '0');
    const rangoPan = await rango('PANADERIA', '2024-12-31', '2025-01-01');
    assert.equal(rangoPan.filas.length, 2);
    assert.equal(rangoPan.totales.ingresoEstimado, '7');
    assert.equal(rangoPan.totales.perdidaProductos, '7');
    assert.equal(rangoPan.totales.costoConsumido, '1543.2098');
    assert.equal(rangoPan.totales.perdidaIngredientes, '617.2839');
    assert(rangoPan.filas.every((f) => f.nombre !== 'Rango REST'));
    const unDia = await rango('PANADERIA', '2025-01-01', '2025-01-01');
    assert.equal(unDia.totales.ingresoEstimado, '4');
    assert.equal(unDia.filas[0].diasValorados, 1);
    const fuera = await rango('RESTAURANTE', '2024-12-28', '2024-12-29');
    assert.equal(fuera.filas.length, 0);
    assert.equal(fuera.totales.ingresoEstimado, '0');
    const ultimoDiaBisiesto = await rango(
      'PANADERIA',
      '2024-02-29',
      '2024-02-29',
    );
    assert.equal(ultimoDiaBisiesto.filas.length, 0);
    for (const query of [
      '',
      'from=2024-12-31',
      'to=2025-01-01',
      'from=2026-02-29&to=2026-03-01',
      'from=2026-04-31&to=2026-05-01',
      'from=2026-9-1&to=2026-09-07',
      'from=2025-01-02&to=2025-01-01',
      'from=2024-01-01&to=2025-01-01',
    ])
      await pedir(
        owner,
        `/recipes/inventory-valuation/range?${query}`,
        'GET',
        undefined,
        400,
        'PANADERIA',
      );
    await pedir(
      cashPan,
      '/recipes/inventory-valuation/range?from=2024-12-31&to=2025-01-01',
      'GET',
      undefined,
      403,
    );
    await pedir(
      adminRest,
      '/recipes/inventory-valuation/range?from=2024-12-31&to=2025-01-01',
      'GET',
      undefined,
      403,
      'PANADERIA',
    );

    // Primera alta en la lista fija: el stock de hoy ya incluye entradas y
    // salidas. La apertura debe deshacer esos movimientos, no sumarlos dos veces.
    const inicialIngrediente = await pedir(
      adminRest,
      '/recipes/ingredients',
      'POST',
      { name: 'Saldo inicial automático', stock: 70, units: 'kg', price: 1000 },
      201,
    );
    await pedir(
      cashRest,
      `/recipes/ingredients/${inicialIngrediente.id_ingrediente}/movements`,
      'POST',
      { tipo: 'ENTRADA', cantidad: 20 },
      201,
    );
    await prisma.$transaction(async (tx) => {
      const entregaInicial = await tx.detalleComanda.create({
        data: {
          id_comanda_dc: comanda.id_comanda,
          id_producto_dc: producto.id_producto,
          cantidad_producto_dc: 10,
          precio_unitario_dc: 2500,
          estado_dc: 'ENTREGADO',
          fecha_entrega_dc: new Date(),
        },
      });
      await tx.movimientoInventario.create({
        data: {
          id_ingrediente_movimiento: inicialIngrediente.id_ingrediente,
          id_detalleComanda_movimiento: entregaInicial.id_detalleComanda,
          tipo_movimiento: 'SALIDA_RECETA',
          cantidad_movimiento: 10,
        },
      });
      await tx.ingrediente.update({
        where: { id_ingrediente: inicialIngrediente.id_ingrediente },
        data: { stock_ingrediente: { decrement: 10 } },
      });
    });
    const stockInicialActual = async () =>
      (
        await prisma.ingrediente.findUniqueOrThrow({
          where: { id_ingrediente: inicialIngrediente.id_ingrediente },
        })
      ).stock_ingrediente.toString();
    assert.equal(await stockInicialActual(), '80');
    const fijoInicial = await pedir(
      adminRest,
      '/recipes/inventory-counts/elements',
      'POST',
      { tipo: 'INGREDIENTE', idObjetivo: inicialIngrediente.id_ingrediente },
      201,
    );
    assert.equal(fijoInicial.cantidadInicial, '70');
    assert.equal(
      await stockInicialActual(),
      '80',
      'Dar de alta no modifica inventario',
    );
    const preparados = await pedir(
      cashRest,
      `/recipes/inventory-counts/prepare?date=${fecha}`,
      'POST',
      {},
      201,
    );
    const inicialPreparado = preparados.find(
      (c) =>
        c.id_ingrediente_conteoInventario === inicialIngrediente.id_ingrediente,
    );
    assert(inicialPreparado, 'La lista fija prepara el primer conteo');
    assert.equal(inicialPreparado.cantidad_anterior_conteoInventario, '70');
    assert.equal(inicialPreparado.cantidad_entradas_conteoInventario, '20');
    const inicialCerrado = await pedir(
      cashRest,
      `/recipes/inventory-counts/${inicialPreparado.id_conteoInventario}/finalize`,
      'PATCH',
      { cantidadFisica: 80 },
    );
    assert.equal(inicialCerrado.cantidad_salida_conteoInventario, '10');
    assert.equal(inicialCerrado.valoracion.costoConsumido, '10000');
    assert.equal(inicialCerrado.valoracion.perdidaEstimada, '0');
    assert.equal(
      await stockInicialActual(),
      '80',
      'Contar no ajusta stock automáticamente',
    );
    await pedir(
      cashRest,
      `/recipes/ingredients/${inicialIngrediente.id_ingrediente}/movements`,
      'POST',
      { tipo: 'ENTRADA', cantidad: 5 },
      201,
    );
    const fijoPersistido = await prisma.elementoConteoDiario.findUniqueOrThrow({
      where: { id: fijoInicial.id },
    });
    assert.equal(fijoPersistido.cantidadInicial.toString(), '70');
    await pedir(
      adminRest,
      `/recipes/inventory-counts/${inicialPreparado.id_conteoInventario}/reopen`,
      'PATCH',
      {},
    );
    const inicialRecontado = await pedir(
      cashRest,
      `/recipes/inventory-counts/${inicialPreparado.id_conteoInventario}/finalize`,
      'PATCH',
      { cantidadFisica: 85 },
    );
    assert.equal(inicialRecontado.cantidad_anterior_conteoInventario, '70');
    assert.equal(inicialRecontado.cantidad_entradas_conteoInventario, '25');
    assert.equal(inicialRecontado.valoracion.perdidaEstimada, '0');
    assert.equal(await stockInicialActual(), '85');
    const filaInicial = (await rango('RESTAURANTE', fecha, fecha)).filas.find(
      (f) =>
        f.tipo === 'INGREDIENTE' &&
        f.idObjetivo === inicialIngrediente.id_ingrediente,
    );
    assert.equal(filaInicial.costoConsumido, '10000');
    assert.equal(filaInicial.perdidaEstimada, '0');

    // El producto restaurante no tiene inventario propio; no se inventa cero.
    const productoManual = await prisma.producto.create({
      data: { nombre_producto: 'Saldo manual REST', precio_producto: 1000 },
    });
    await pedir(
      adminRest,
      '/recipes/inventory-counts/elements',
      'POST',
      { tipo: 'PRODUCTO', idObjetivo: productoManual.id_producto },
      400,
    );
    const fijoManual = await pedir(
      adminRest,
      '/recipes/inventory-counts/elements',
      'POST',
      {
        tipo: 'PRODUCTO',
        idObjetivo: productoManual.id_producto,
        cantidadInicial: 4,
      },
      201,
    );
    assert.equal(fijoManual.cantidadInicial, '4');

    // Las metas confirmadas son entradas físicas para el conteo, pero no
    // modifican el stock cacheado. No se invierten al reconstruir la apertura.
    const ingredienteMeta = await pedir(
      adminRest,
      '/recipes/ingredients',
      'POST',
      { name: 'Meta de ingrediente', stock: 6.5, units: 'kg', price: 1000 },
      201,
    );
    const metaInicial = await pedir(
      adminRest,
      '/recipes/production-plans',
      'POST',
      {
        fecha,
        tipo: 'INGREDIENTE',
        idObjetivo: ingredienteMeta.id_ingrediente,
        cantidad: 5,
      },
      201,
    );
    await pedir(
      cashRest,
      `/recipes/production-plans/${metaInicial.id_planProduccion}/status`,
      'PATCH',
      { estado: 'PRODUCIDO' },
    );
    assert.equal(
      (
        await prisma.ingrediente.findUniqueOrThrow({
          where: { id_ingrediente: ingredienteMeta.id_ingrediente },
        })
      ).stock_ingrediente.toString(),
      '6.5',
    );
    const fijoMeta = await pedir(
      adminRest,
      '/recipes/inventory-counts/elements',
      'POST',
      { tipo: 'INGREDIENTE', idObjetivo: ingredienteMeta.id_ingrediente },
      201,
    );
    assert.equal(fijoMeta.cantidadInicial, '6.5');
    const preparadosMeta = await pedir(
      cashRest,
      `/recipes/inventory-counts/prepare?date=${fecha}`,
      'POST',
      {},
      201,
    );
    const conteoMeta = preparadosMeta.find(
      (c) =>
        c.id_ingrediente_conteoInventario === ingredienteMeta.id_ingrediente,
    );
    assert.equal(conteoMeta.cantidad_anterior_conteoInventario, '6.5');
    assert.equal(conteoMeta.cantidad_entradas_conteoInventario, '5');
    const metaContada = await pedir(
      cashRest,
      `/recipes/inventory-counts/${conteoMeta.id_conteoInventario}/finalize`,
      'PATCH',
      { cantidadFisica: 11.5 },
    );
    assert.equal(metaContada.cantidad_salida_conteoInventario, '0');
    assert.equal(metaContada.valoracion.perdidaEstimada, '0');

    // Panadería usa la existencia anterior al primer movimiento del día.
    const inicialPan = await pedir(
      adminPan,
      '/bakery/articulos',
      'POST',
      { nombre: 'Apertura inventario PAN', tipo: 'EXTERNO', precioVenta: 2500 },
      201,
    );
    await prisma.articuloPanaderia.update({
      where: { id: inicialPan.id },
      data: { existencia: 70 },
    });
    await pedir(
      cashPan,
      `/bakery/articulos/${inicialPan.id}/entradas`,
      'POST',
      { cantidad: 20, concepto: 'Entrada del día' },
      201,
    );
    await pedir(
      cashPan,
      '/bakery/ventas',
      'POST',
      {
        claveOperacion: crypto.randomUUID(),
        lineas: [{ articuloId: inicialPan.id, cantidad: 10 }],
        pagos: [{ metodo: 'EFECTIVO', monto: 25000 }],
      },
      201,
    );
    const panStock = async () =>
      (
        await prisma.articuloPanaderia.findUniqueOrThrow({
          where: { id: inicialPan.id },
        })
      ).existencia.toString();
    assert.equal(await panStock(), '80');
    const inicialPanContado = await pedir(
      cashPan,
      `/bakery/conteo/${inicialPan.id}`,
      'POST',
      { cantidadFisica: 80 },
      201,
    );
    assert.equal(inicialPanContado.cantidadInicial, '70');
    assert.equal(inicialPanContado.entradas, '20');
    assert.equal(inicialPanContado.valoracion.ingresoEstimado, '25000');
    assert.equal(inicialPanContado.valoracion.perdidaEstimada, '0');
    assert.equal(await panStock(), '80');
    await pedir(
      cashPan,
      `/bakery/articulos/${inicialPan.id}/entradas`,
      'POST',
      { cantidad: 5, concepto: 'Entrada después del conteo' },
      201,
    );
    const panRecontado = await pedir(
      cashPan,
      `/bakery/conteo/${inicialPan.id}`,
      'POST',
      { cantidadFisica: 85 },
      201,
    );
    assert.equal(panRecontado.cantidadInicial, '70');
    assert.equal(panRecontado.entradas, '25');
    assert.equal(panRecontado.valoracion.perdidaEstimada, '0');
    assert.equal(await panStock(), '85');

    // La base física previa manda aunque aún no se hubiera ajustado el cache.
    const ayer = new Date(new Date(fecha).getTime() - 86400000)
      .toISOString()
      .slice(0, 10);
    const haceTresDias = new Date(new Date(fecha).getTime() - 3 * 86400000)
      .toISOString()
      .slice(0, 10);
    const haceDosDias = new Date(new Date(fecha).getTime() - 2 * 86400000)
      .toISOString()
      .slice(0, 10);
    async function articuloConCierre(nombre, fechaCierre, registro) {
      const articulo = await pedir(
        adminPan,
        '/bakery/articulos',
        'POST',
        { nombre, tipo: 'EXTERNO', precioVenta: 2500 },
        201,
      );
      await prisma.articuloPanaderia.update({
        where: { id: articulo.id },
        data: { existencia: 20 },
      });
      await prisma.conteoPanaderia.create({
        data: {
          articuloId: articulo.id,
          usuarioId: cashPan.id_usuario,
          fecha: new Date(fechaCierre),
          fechaRegistro: new Date(registro),
          cantidadInicial: 20,
          entradas: 0,
          ventasRegistradas: 0,
          transferencias: 0,
          mermas: 0,
          consumoReceta: 0,
          cantidadFisica: 17,
          precioReferencia: 2500,
        },
      });
      return articulo;
    }
    const previoFisicoPan = await articuloConCierre(
      'Cierre físico sin ajuste',
      ayer,
      `${ayer}T22:00:00Z`,
    );
    const proyectadoPrevio = (
      await pedir(cashPan, '/bakery/conteo')
    ).proyeccion.find((p) => p.articuloId === previoFisicoPan.id);
    assert.equal(proyectadoPrevio.cantidadInicial, '17');
    const contadoPrevio = await pedir(
      cashPan,
      `/bakery/conteo/${previoFisicoPan.id}`,
      'POST',
      { cantidadFisica: 17 },
      201,
    );
    assert.equal(
      contadoPrevio.cantidadInicial,
      proyectadoPrevio.cantidadInicial,
    );
    assert.equal(contadoPrevio.valoracion.perdidaEstimada, '0');
    assert.equal(
      (
        await prisma.articuloPanaderia.findUniqueOrThrow({
          where: { id: previoFisicoPan.id },
        })
      ).existencia.toString(),
      '20',
    );
    await pedir(
      cashPan,
      `/bakery/articulos/${previoFisicoPan.id}/entradas`,
      'POST',
      { cantidad: 5, concepto: 'Recepción después del conteo físico' },
      201,
    );
    const previoRecontado = await pedir(
      cashPan,
      `/bakery/conteo/${previoFisicoPan.id}`,
      'POST',
      { cantidadFisica: 22 },
      201,
    );
    assert.equal(previoRecontado.cantidadInicial, '17');
    assert.equal(previoRecontado.valoracion.perdidaEstimada, '0');

    // Días sin conteo y movimientos después del último físico se arrastran;
    // AJUSTE_CONTEO no descuenta otra vez el faltante ya reflejado en el físico.
    const previoConMovimientos = await articuloConCierre(
      'Cierre y movimientos tardíos',
      haceTresDias,
      `${haceTresDias}T22:00:00Z`,
    );
    await prisma.movimientoPanaderia.createMany({
      data: [
        {
          articuloId: previoConMovimientos.id,
          usuarioId: cashPan.id_usuario,
          tipo: 'AJUSTE_CONTEO',
          cantidad: 3,
          existenciaAntes: 20,
          existenciaDespues: 17,
          fecha: new Date(`${haceTresDias}T22:01:00Z`),
          concepto: 'Ajuste del cierre previo',
        },
        {
          articuloId: previoConMovimientos.id,
          usuarioId: cashPan.id_usuario,
          tipo: 'RECEPCION',
          cantidad: 5,
          existenciaAntes: 17,
          existenciaDespues: 22,
          fecha: new Date(`${haceDosDias}T12:00:00Z`),
          concepto: 'Entrada en día omitido',
        },
        {
          articuloId: previoConMovimientos.id,
          usuarioId: cashPan.id_usuario,
          tipo: 'VENTA',
          cantidad: 2,
          existenciaAntes: 22,
          existenciaDespues: 20,
          fecha: new Date(`${ayer}T23:00:00Z`),
          concepto: 'Salida posterior al cierre',
        },
      ],
    });
    const proyectadoNeto = (
      await pedir(cashPan, '/bakery/conteo')
    ).proyeccion.find((p) => p.articuloId === previoConMovimientos.id);
    assert.equal(proyectadoNeto.cantidadInicial, '20');
    const contadoNeto = await pedir(
      cashPan,
      `/bakery/conteo/${previoConMovimientos.id}`,
      'POST',
      { cantidadFisica: 20 },
      201,
    );
    assert.equal(contadoNeto.cantidadInicial, proyectadoNeto.cantidadInicial);
    assert.equal(contadoNeto.valoracion.perdidaEstimada, '0');

    // Un registro retroactivo creado después de comenzar hoy no inventa una
    // apertura histórica; sin libro aplicable hoy conserva el stock actual.
    const registroTardioPan = await articuloConCierre(
      'Registro retroactivo tardío',
      ayer,
      new Date().toISOString(),
    );
    const proyectadoTardio = (
      await pedir(cashPan, '/bakery/conteo')
    ).proyeccion.find((p) => p.articuloId === registroTardioPan.id);
    assert.equal(proyectadoTardio.cantidadInicial, '20');
    const contadoTardio = await pedir(
      cashPan,
      `/bakery/conteo/${registroTardioPan.id}`,
      'POST',
      { cantidadFisica: 20 },
      201,
    );
    assert.equal(contadoTardio.cantidadInicial, '20');
    assert.equal(contadoTardio.valoracion.perdidaEstimada, '0');
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
