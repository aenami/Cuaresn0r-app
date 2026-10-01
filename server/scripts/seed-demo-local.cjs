// Datos ilustrativos para la base POS local. Nunca ejecutar contra una base remota.
// Uso: node scripts/seed-demo-local.cjs --plan | --apply | --verify
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const { PrismaService } = require('../dist/src/prisma/prisma.service');

const url = new URL(process.env.DATABASE_URL ?? 'postgresql://invalid:invalid@invalid/invalid');
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/POS') {
  throw new Error('Este sembrado solo puede utilizar la base POS en localhost.');
}
const modo = process.argv[2];
if (!['--plan', '--apply', '--verify'].includes(modo)) {
  throw new Error('Indica --plan, --apply o --verify.');
}

const marcador = '[DEMO] Insumos La Montaña';
const redondear = (numero) => Math.round((numero + Number.EPSILON) * 10000) / 10000;
const numero = (valor) => Number(valor);
const hoyColombia = () => {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const parte = (tipo) => Number(partes.find((item) => item.type === tipo).value);
  return [parte('year'), parte('month') - 1, parte('day')];
};
const [year, month, day] = hoyColombia();
const fecha = (desfase) => new Date(Date.UTC(year, month, day + desfase));
const hora = (desfase, horas, minutos = 0) =>
  new Date(Date.UTC(year, month, day + desfase, horas + 5, minutos));
const textoFecha = (desfase) => fecha(desfase).toISOString().slice(0, 10);

function valoracion({ articulo, inicial, entradas, ventas, justificadas, consumo, fisico, registrada }) {
  const insumo = articulo.tipo === 'INSUMO';
  const precio = numero(insumo ? articulo.costoReferencia : articulo.precioVenta);
  const salida = redondear(inicial + entradas - fisico);
  const neta = redondear(salida - justificadas);
  const corroborada = insumo ? consumo : ventas;
  const reconocida = redondear(Math.max(0, Math.min(neta, corroborada)));
  const faltante = redondear(Math.max(0, neta - corroborada));
  const sobrante = redondear(Math.max(0, corroborada - neta));
  return {
    version: 1, estado: 'VALIDA',
    tipoReferencia: insumo ? 'COSTO_UNITARIO' : 'PRECIO_VENTA',
    precioReferencia: String(precio), nombre: articulo.nombre, unidad: articulo.unidad,
    fechaValoracion: registrada.toISOString(),
    salidaFisicaEstimada: String(salida), cantidadReconocida: String(reconocida),
    cantidadFaltante: String(faltante), cantidadSobrante: String(sobrante),
    ingresoEstimado: String(insumo ? 0 : redondear(reconocida * precio)),
    costoConsumido: String(insumo ? redondear(reconocida * precio) : 0),
    perdidaEstimada: String(redondear(faltante * precio)),
    valorSobrante: String(redondear(sobrante * precio)),
  };
}

async function ejecutar() {
  const prisma = new PrismaService();
  try {
    await prisma.$connect();
    const [existente, adminPan, adminRest, cajaPan] = await Promise.all([
      prisma.proveedor.findUnique({ where: { area_nombre_proveedor: { area: 'PANADERIA', nombre_proveedor: marcador } } }),
      prisma.usuario.findFirst({ where: { area: 'PANADERIA', rol: { nombre_rol: 'ADMIN_LOCAL' } }, select: { id_usuario: true } }),
      prisma.usuario.findFirst({ where: { area: 'RESTAURANTE', rol: { nombre_rol: 'ADMIN_LOCAL' } }, select: { id_usuario: true } }),
      prisma.caja.findFirst({ where: { area: 'PANADERIA' }, select: { id_caja: true } }),
    ]);
    if (modo === '--verify') {
      if (!existente) throw new Error('No se encontró el marcador [DEMO].');
      const [articulos, ventas, conteos, turnosAbiertos, salidasRestaurante, cuentas, aperturaCafe, costosProductos] = await Promise.all([
        prisma.articuloPanaderia.count({ where: { nombre: { startsWith: '[DEMO]' } } }),
        prisma.ventaPanaderia.findMany({ where: { claveOperacion: { startsWith: 'DEMO-PAN-' } }, select: { total: true, pagos: { select: { monto: true } } } }),
        prisma.conteoPanaderia.findMany({ where: { articulo: { nombre: { startsWith: '[DEMO]' } } }, select: { valoracion: true } }),
        prisma.turno.findMany({ where: { estado_turno: 'ABIERTO' }, select: { id_turno: true, caja: { select: { area: true } } } }),
        prisma.salidaProductoRestaurante.count({ where: { motivo: { startsWith: '[DEMO]' } } }),
        prisma.cuentaPorPagar.count({ where: { documento_cuentaPorPagar: { startsWith: 'DEMO-' } } }),
        prisma.elementoConteoDiario.findFirst({ where: { ingrediente: { nombre_ingrediente: '[DEMO] Café molido' } }, select: { cantidadInicial: true } }),
        prisma.articuloPanaderia.count({ where: { nombre: { startsWith: '[DEMO]' }, tipo: { not: 'INSUMO' }, costoReferencia: { not: null } } }),
      ]);
      const totalVentas = ventas.reduce((suma, venta) => suma + numero(venta.total), 0);
      const totalPagos = ventas.reduce((suma, venta) => suma + venta.pagos.reduce((subtotal, pago) => subtotal + numero(pago.monto), 0), 0);
      const ingresoEstimado = conteos.reduce((suma, conteo) => suma + numero(conteo.valoracion?.ingresoEstimado ?? 0), 0);
      const perdidaEstimada = conteos.reduce((suma, conteo) => suma + numero(conteo.valoracion?.perdidaEstimada ?? 0), 0);
      if (articulos !== 10 || ventas.length !== 3 || conteos.length !== 12 || salidasRestaurante !== 1 || cuentas !== 2 || numero(aperturaCafe?.cantidadInicial) !== 0 || costosProductos !== 0 || totalVentas !== totalPagos || totalVentas !== ingresoEstimado || perdidaEstimada !== 6950) {
        throw new Error('Los datos [DEMO] no concilian; revisa el historial local.');
      }
      process.stdout.write(`Verificado POS local: ${articulos} artículos de Panadería, ${ventas.length} ventas por $${totalVentas}, ${conteos.length} conteos, ingreso estimado $${ingresoEstimado}, pérdida estimada $${perdidaEstimada}, ${salidasRestaurante} salida de producto de Restaurante y ${cuentas} cuentas pendientes. Turnos abiertos preservados: ${turnosAbiertos.map((turno) => `${turno.caja.area} #${turno.id_turno}`).join(', ')}.\n`);
      return;
    }
    if (existente) {
      process.stdout.write('Los datos [DEMO] ya existen; no se duplicó ningún registro.\n');
      return;
    }
    if (!adminPan || !adminRest || !cajaPan) {
      throw new Error('Faltan administradores locales o una caja de Panadería; no se modificó la base.');
    }
    if (modo === '--plan') {
      process.stdout.write(`Plan local POS: 10 artículos de Panadería, 2 recetas, 3 días de movimientos/ventas/conteos (${textoFecha(-3)} a ${textoFecha(-1)}), categorías, productos e ingredientes de Restaurante, salidas justificadas, proveedores, cuentas pendientes y una meta de producción. No se modificarán turnos abiertos. Ejecuta --apply después de verificar el respaldo.\n`);
      return;
    }

    const resultado = await prisma.$transaction(async (tx) => {
      const proveedorPan = await tx.proveedor.create({ data: { area: 'PANADERIA', nombre_proveedor: marcador, contacto_proveedor: '[DEMO] Proveedor de ejemplo' } });
      const proveedorRest = await tx.proveedor.create({ data: { area: 'RESTAURANTE', nombre_proveedor: '[DEMO] Suministros Cafetería', contacto_proveedor: '[DEMO] Proveedor de ejemplo' } });
      await tx.cuentaPorPagar.createMany({ data: [
        { area: 'PANADERIA', id_proveedor_cuentaPorPagar: proveedorPan.id_proveedor, concepto_cuentaPorPagar: '[DEMO] Mantenimiento del horno', documento_cuentaPorPagar: 'DEMO-PAN-001', fecha_emision_cuentaPorPagar: fecha(-2), fecha_vencimiento_cuentaPorPagar: fecha(5), monto_total_cuentaPorPagar: 120000 },
        { area: 'RESTAURANTE', id_proveedor_cuentaPorPagar: proveedorRest.id_proveedor, concepto_cuentaPorPagar: '[DEMO] Insumos pendientes de entrega', documento_cuentaPorPagar: 'DEMO-RES-001', fecha_emision_cuentaPorPagar: fecha(-1), fecha_vencimiento_cuentaPorPagar: fecha(7), monto_total_cuentaPorPagar: 95000 },
      ] });

      const categoriasPan = {};
      for (const [clave, nombre, tipo] of [
        ['pan', '[DEMO] Panes artesanales', 'PANADERIA'],
        ['postre', '[DEMO] Tortas y postres', 'PASTELERIA'],
        ['externo', '[DEMO] Bebidas frías', 'EXTERNO'],
      ]) {
        categoriasPan[clave] = await tx.categoriaPanaderia.create({ data: { nombre, tipo } });
      }
      const definiciones = [
        ['pan', 'Pan campesino', 'PANADERIA', 'UNIDADES', 3500, null, 'pan'],
        ['integral', 'Pan integral', 'PANADERIA', 'UNIDADES', 4000, null, 'pan'],
        ['torta', 'Torta de chocolate', 'PASTELERIA', 'UNIDADES', 7500, null, 'postre'],
        ['galleta', 'Galleta de avena', 'PASTELERIA', 'UNIDADES', 2800, null, 'postre'],
        ['agua', 'Agua 600 ml', 'EXTERNO', 'UNIDADES', 3000, null, 'externo'],
        ['avena', 'Avena botella', 'EXTERNO', 'UNIDADES', 4500, null, 'externo'],
        ['harina', 'Harina panadera', 'INSUMO', 'kg', 4500, 4500, null],
        ['chocolate', 'Chocolate cobertura', 'INSUMO', 'kg', 20000, 20000, null],
        ['levadura', 'Levadura', 'INSUMO', 'g', 80, 80, null],
        ['mantequilla', 'Mantequilla', 'INSUMO', 'kg', 25000, 25000, null],
      ];
      const articulos = {};
      const saldo = {};
      const diario = new Map();
      for (const [clave, nombre, tipo, unidad, precioVenta, costoReferencia, categoria] of definiciones) {
        articulos[clave] = await tx.articuloPanaderia.create({ data: {
          nombre: `[DEMO] ${nombre}`, tipo, unidad, precioVenta, costoReferencia,
          categoriaId: categoria ? categoriasPan[categoria].id : null, existencia: 0,
        } });
        saldo[clave] = 0;
      }
      for (const clave of ['pan', 'torta', 'agua', 'harina']) {
        await tx.elementoConteoPanaderia.create({ data: { articuloId: articulos[clave].id, fechaInicio: fecha(-3) } });
      }
      const recetaPan = await tx.recetaPanaderia.create({ data: {
        articuloId: articulos.pan.id, nombre: '[DEMO] Masa de pan campesino',
        detalles: { create: [
          { insumoId: articulos.harina.id, cantidadUnidad: 0.09 },
          { insumoId: articulos.levadura.id, cantidadUnidad: 5 },
        ] },
      } });
      const recetaTorta = await tx.recetaPanaderia.create({ data: {
        articuloId: articulos.torta.id, nombre: '[DEMO] Torta de chocolate',
        detalles: { create: [
          { insumoId: articulos.harina.id, cantidadUnidad: 0.05 },
          { insumoId: articulos.chocolate.id, cantidadUnidad: 0.03 },
          { insumoId: articulos.mantequilla.id, cantidadUnidad: 0.02 },
        ] },
      } });
      async function movimiento(clave, tipo, cantidad, signo, desfase, hh, extra = {}) {
        const antes = saldo[clave];
        const despues = redondear(antes + signo * cantidad);
        if (despues < 0) throw new Error(`Stock demo insuficiente: ${clave}`);
        const registro = await tx.movimientoPanaderia.create({ data: {
          articuloId: articulos[clave].id, usuarioId: adminPan.id_usuario,
          tipo, cantidad, existenciaAntes: antes, existenciaDespues: despues,
          concepto: `[DEMO] ${extra.concepto ?? tipo.toLowerCase()}`,
          fecha: hora(desfase, hh), ...(extra.ventaId && { ventaId: extra.ventaId }),
          ...(extra.recetaId && { recetaId: extra.recetaId }),
        } });
        saldo[clave] = despues;
        if (tipo !== 'AJUSTE_CONTEO') {
          const llave = `${desfase}:${clave}`;
          const lista = diario.get(llave) ?? [];
          lista.push(registro);
          diario.set(llave, lista);
        }
      }
      const fisicoAnterior = {};
      const jornadas = [
        { dia: -3, pan: 30, torta: 8, agua: 24, harina: 40, ventas: [12, 3, 5], perdida: { pan: 1, agua: 1, harina: 0.1 } },
        { dia: -2, pan: 25, torta: 6, agua: 12, harina: 10, ventas: [18, 4, 8], perdida: {} },
        { dia: -1, pan: 20, torta: 4, agua: 12, harina: 5, ventas: [15, 5, 10], perdida: {} },
      ];
      for (const jornada of jornadas) {
        const d = jornada.dia;
        for (const [clave, cantidad] of Object.entries({ harina: jornada.harina, agua: jornada.agua, ...(d === -3 ? { chocolate: 5, levadura: 1000, mantequilla: 4, integral: 18, galleta: 16, avena: 18 } : {}) })) {
          await movimiento(clave, 'RECEPCION', cantidad, 1, d, 8, { concepto: 'entrada de referencia' });
        }
        for (const [clave, cantidad, receta, partes] of [
          ['pan', jornada.pan, recetaPan, [['harina', 0.09], ['levadura', 5]]],
          ['torta', jornada.torta, recetaTorta, [['harina', 0.05], ['chocolate', 0.03], ['mantequilla', 0.02]]],
        ]) {
          await movimiento(clave, 'PRODUCCION', cantidad, 1, d, 10, { recetaId: receta.id, concepto: 'hornada terminada' });
          for (const [insumo, porUnidad] of partes) {
            await movimiento(insumo, 'CONSUMO_RECETA', redondear(cantidad * porUnidad), -1, d, 10, { recetaId: receta.id, concepto: `insumo para ${clave}` });
          }
        }
        const unidades = { pan: jornada.ventas[0], torta: jornada.ventas[1], agua: jornada.ventas[2] };
        const total = Object.entries(unidades).reduce((suma, [clave, cantidad]) => suma + cantidad * numero(articulos[clave].precioVenta), 0);
        const efectivo = Math.round(total * 0.7);
        const turno = await tx.turno.create({ data: {
          id_caja_turno: cajaPan.id_caja, id_usuario_turno: adminPan.id_usuario,
          fecha_apertura_turno: hora(d, 7), fecha_cierre_turno: hora(d, 21),
          monto_apertura_turno: 300000, monto_cierre_esperado: 300000 + efectivo,
          monto_cierre_real_turno: 300000 + efectivo, estado_turno: 'CERRADO', tipo_turno: 'UNICO',
        } });
        const venta = await tx.ventaPanaderia.create({ data: {
          claveOperacion: `DEMO-PAN-${textoFecha(d)}`, turnoId: turno.id_turno, fecha: hora(d, 15),
          total, concepto: '[DEMO] Ventas ilustrativas del día',
          detalles: { create: Object.entries(unidades).map(([clave, cantidad]) => ({
            articuloId: articulos[clave].id, cantidad,
            precioUnitario: numero(articulos[clave].precioVenta),
            subtotal: cantidad * numero(articulos[clave].precioVenta),
            nombreSnapshot: articulos[clave].nombre,
          })) },
          pagos: { create: [
            { metodo: 'EFECTIVO', monto: efectivo },
            { metodo: 'TRANSFERENCIA', monto: total - efectivo },
          ] },
        } });
        for (const [clave, cantidad] of Object.entries(unidades)) {
          await movimiento(clave, 'VENTA', cantidad, -1, d, 15, { ventaId: venta.id, concepto: 'venta registrada' });
        }
        if (d === -3) {
          await movimiento('pan', 'SALIDA_MANUAL', 1, -1, d, 16, { concepto: 'degustación autorizada' });
          await movimiento('agua', 'SALIDA_MANUAL', 1, -1, d, 16, { concepto: 'botella dañada' });
        }
        if (d === -2) await movimiento('torta', 'SALIDA_MANUAL', 1, -1, d, 16, { concepto: 'muestra de vitrina' });
        if (d === -1) await movimiento('pan', 'SALIDA_MANUAL', 2, -1, d, 16, { concepto: 'donación registrada' });

        for (const clave of ['pan', 'torta', 'agua', 'harina']) {
          const movimientos = diario.get(`${d}:${clave}`) ?? [];
          const sumar = (...tipos) => redondear(movimientos.filter((item) => tipos.includes(item.tipo)).reduce((total, item) => total + numero(item.cantidad), 0));
          const inicial = fisicoAnterior[clave] ?? 0;
          const entradas = sumar('RECEPCION', 'PRODUCCION');
          const ventas = sumar('VENTA');
          const salidas = sumar('SALIDA_MANUAL');
          const consumo = sumar('CONSUMO_RECETA');
          const fisico = redondear(saldo[clave] - (jornada.perdida[clave] ?? 0));
          const registrada = hora(d, 21, 30);
          await tx.conteoPanaderia.create({ data: {
            fecha: fecha(d), articuloId: articulos[clave].id, usuarioId: adminPan.id_usuario,
            cantidadInicial: inicial, entradas, ventasRegistradas: ventas, transferencias: 0,
            mermas: 0, salidasJustificadas: salidas, consumoReceta: consumo,
            cantidadFisica: fisico, precioReferencia: numero(articulos[clave].precioVenta),
            fechaRegistro: registrada,
            valoracion: valoracion({ articulo: articulos[clave], inicial, entradas, ventas,
              justificadas: salidas, consumo, fisico, registrada }),
          } });
          fisicoAnterior[clave] = fisico;
          if (jornada.perdida[clave]) {
            await movimiento(clave, 'AJUSTE_CONTEO', jornada.perdida[clave], -1, d, 22, { concepto: 'ajuste posterior al conteo' });
          }
        }
      }
      for (const [clave, articulo] of Object.entries(articulos)) {
        await tx.articuloPanaderia.update({ where: { id: articulo.id }, data: { existencia: saldo[clave] } });
      }

      const categoriaRest = await tx.categoria.create({ data: {
        nombre_categoria: '[DEMO] Cafetería', descripcion_categoria: 'Productos ilustrativos', destino_categoria: 'BARRA',
      } });
      const productoCafe = await tx.producto.create({ data: {
        nombre_producto: '[DEMO] Café especial', precio_producto: 6500,
        categoria_producto: categoriaRest.id_categoria, descripcion_producto: 'Producto ilustrativo',
      } });
      const productoPan = await tx.producto.create({ data: {
        nombre_producto: '[DEMO] Pan con queso', precio_producto: 5500,
        categoria_producto: categoriaRest.id_categoria, descripcion_producto: 'Producto ilustrativo',
      } });
      const ingredienteCafe = await tx.ingrediente.create({ data: {
        nombre_ingrediente: '[DEMO] Café molido', stock_ingrediente: 18,
        unidades_ingrediente: 'kg', precio_ingrediente: 60000,
        umbral_bajo_ingrediente: 5, umbral_alto_ingrediente: 30,
      } });
      const ingredienteLeche = await tx.ingrediente.create({ data: {
        nombre_ingrediente: '[DEMO] Leche entera', stock_ingrediente: 15,
        unidades_ingrediente: 'L', precio_ingrediente: 4500,
        umbral_bajo_ingrediente: 3, umbral_alto_ingrediente: 25,
      } });
      await tx.receta.create({ data: {
        id_producto_receta: productoCafe.id_producto, nombre_receta: '[DEMO] Café con leche', receta_activa: true,
        detalles: { create: [
          { id_ingrediente_detalleReceta: ingredienteCafe.id_ingrediente, cantidad_ingrediente_detalleReceta: 0.018 },
          { id_ingrediente_detalleReceta: ingredienteLeche.id_ingrediente, cantidad_ingrediente_detalleReceta: 0.2 },
        ] },
      } });
      await tx.movimientoInventario.createMany({ data: [
        { id_ingrediente_movimiento: ingredienteCafe.id_ingrediente, id_usuario_movimiento: adminRest.id_usuario,
          tipo_movimiento: 'ENTRADA', cantidad_movimiento: 20, fecha_movimiento: hora(0, 8), motivo_movimiento: '[DEMO] saldo de arranque' },
        { id_ingrediente_movimiento: ingredienteCafe.id_ingrediente, id_usuario_movimiento: adminRest.id_usuario,
          tipo_movimiento: 'SALIDA_MANUAL', cantidad_movimiento: 2, fecha_movimiento: hora(0, 11), motivo_movimiento: '[DEMO] muestra para degustación' },
        { id_ingrediente_movimiento: ingredienteLeche.id_ingrediente, id_usuario_movimiento: adminRest.id_usuario,
          tipo_movimiento: 'ENTRADA', cantidad_movimiento: 15, fecha_movimiento: hora(0, 8), motivo_movimiento: '[DEMO] saldo de arranque' },
      ] });
      await tx.salidaProductoRestaurante.create({ data: {
        productoId: productoPan.id_producto, cantidad: 2, motivo: '[DEMO] muestra para degustación',
        usuarioId: adminRest.id_usuario, fecha: hora(0, 11),
      } });
      await tx.elementoConteoDiario.createMany({ data: [
        { tipo: 'PRODUCTO', idProducto: productoPan.id_producto, cantidadInicial: 15, fechaInicio: fecha(0) },
        // El inventario actual (18 kg) ya incorpora la recepción de 20 kg y
        // la salida de 2 kg del mismo día; la apertura del día fue cero.
        { tipo: 'INGREDIENTE', idIngrediente: ingredienteCafe.id_ingrediente, cantidadInicial: 0, fechaInicio: fecha(0) },
      ] });
      await tx.planProduccionDiaria.create({ data: {
        fecha_planProduccion: fecha(0), tipo_objetivo_planProduccion: 'PRODUCTO',
        id_producto_planProduccion: productoPan.id_producto,
        nombre_objetivo_planProduccion: productoPan.nombre_producto,
        unidad_objetivo_planProduccion: 'UNIDADES', cantidad_objetivo_planProduccion: 20,
        id_usuario_crea_planProduccion: adminRest.id_usuario,
      } });
      return { panaderia: Object.keys(articulos).length, restaurante: 4, ventasPanaderia: jornadas.length, conteosPanaderia: jornadas.length * 4 };
    }, { timeout: 120000, maxWait: 20000 });
    process.stdout.write(`Datos [DEMO] cargados solo en POS local: ${JSON.stringify(resultado)}.\n`);
  } finally {
    await prisma.$disconnect();
  }
}

ejecutar().catch((error) => {
  process.stderr.write(`No se completó la carga [DEMO]: ${error.message}\n`);
  process.exitCode = 1;
});
