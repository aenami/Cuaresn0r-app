import { Prisma, ConteoInventarioDiario } from '../generated/prisma/client';

export function fechaColombia(instante = new Date()) {
  // Colombia permanece en UTC-5 todo el año.
  return new Date(
    new Date(instante.getTime() - 5 * 3600000).toISOString().slice(0, 10),
  );
}

export function rangoDia(fecha: Date) {
  const inicio = new Date(fecha.getTime() + 5 * 3600000);
  return { inicio, fin: new Date(inicio.getTime() + 86400000) };
}

export type Salida = {
  cantidad: Prisma.Decimal;
  cantidadCorroborada?: Prisma.Decimal;
  cantidadTrasladada?: Prisma.Decimal;
  cantidadMerma?: Prisma.Decimal;
  cantidadJustificada?: Prisma.Decimal;
  ultima: Date | null;
  sinFecha: boolean;
};

// Usa las cantidades de receta realmente descontadas (incluye personalizaciones),
// nunca la receta actual. Los componentes de combos son productos independientes;
// su encabezado, sin producto, no duplica las unidades.
export async function salidasEntregadas(
  db: Prisma.TransactionClient,
  fecha: Date,
) {
  const { inicio, fin } = rangoDia(fecha);
  const dias = await salidasEntregadasEnRango(db, inicio, fin);
  return (
    dias.get(fecha.toISOString().slice(0, 10)) ?? new Map<string, Salida>()
  );
}

// Una consulta por rango, no una consulta por cada elemento/día del informe.
export async function salidasEntregadasEnRango(
  db: Prisma.TransactionClient,
  inicio: Date,
  fin: Date,
) {
  const detalles = await db.detalleComanda.findMany({
    where: {
      estado_dc: 'ENTREGADO',
      OR: [
        { fecha_entrega_dc: { gte: inicio, lt: fin } },
        // La fecha de envío solo identifica historia incompleta; NO se cuenta
        // como entrega ni se presenta una coincidencia basada en una suposición.
        {
          fecha_entrega_dc: null,
          comanda: { fecha_envio_comanda: { gte: inicio, lt: fin } },
        },
      ],
    },
    select: {
      id_producto_dc: true,
      cantidad_producto_dc: true,
      fecha_entrega_dc: true,
      comanda: { select: { fecha_envio_comanda: true } },
      movimientosInventario: {
        where: { tipo_movimiento: 'SALIDA_RECETA', reversos: { none: {} } },
        select: { id_ingrediente_movimiento: true, cantidad_movimiento: true },
      },
    },
  });
  const dias = new Map<string, Map<string, Salida>>();
  const agregar = (
    clave: string,
    cantidad: Prisma.Decimal | number,
    entrega: Date | null,
    referenciaDia: Date,
    clase: 'CORROBORADA' | 'TRASLADO' | 'MERMA' | 'JUSTIFICADA' = 'CORROBORADA',
  ) => {
    const dia = fechaColombia(referenciaDia).toISOString().slice(0, 10);
    const salidas = dias.get(dia) ?? new Map<string, Salida>();
    dias.set(dia, salidas);
    const anterior = salidas.get(clave) ?? {
      cantidad: new Prisma.Decimal(0),
      cantidadCorroborada: new Prisma.Decimal(0),
      cantidadTrasladada: new Prisma.Decimal(0),
      cantidadMerma: new Prisma.Decimal(0),
      cantidadJustificada: new Prisma.Decimal(0),
      ultima: null,
      sinFecha: false,
    };
    if (entrega) {
      anterior.cantidad = anterior.cantidad.plus(cantidad);
      if (clase === 'TRASLADO')
        anterior.cantidadTrasladada =
          anterior.cantidadTrasladada!.plus(cantidad);
      else if (clase === 'MERMA')
        anterior.cantidadMerma = anterior.cantidadMerma!.plus(cantidad);
      else if (clase === 'JUSTIFICADA')
        anterior.cantidadJustificada =
          anterior.cantidadJustificada!.plus(cantidad);
      else
        anterior.cantidadCorroborada =
          anterior.cantidadCorroborada!.plus(cantidad);
      if (!anterior.ultima || entrega > anterior.ultima)
        anterior.ultima = entrega;
    } else anterior.sinFecha = true;
    salidas.set(clave, anterior);
  };
  for (const detalle of detalles) {
    if (detalle.id_producto_dc !== null)
      agregar(
        `PRODUCTO:${detalle.id_producto_dc}`,
        detalle.cantidad_producto_dc,
        detalle.fecha_entrega_dc,
        detalle.fecha_entrega_dc ??
          detalle.comanda?.fecha_envio_comanda ??
          inicio,
      );
    for (const movimiento of detalle.movimientosInventario)
      agregar(
        `INGREDIENTE:${movimiento.id_ingrediente_movimiento}`,
        movimiento.cantidad_movimiento,
        detalle.fecha_entrega_dc,
        detalle.fecha_entrega_dc ??
          detalle.comanda?.fecha_envio_comanda ??
          inicio,
      );
  }
  const traslados = await db.transferenciaRestaurantePanaderia.findMany({
    where: { fechaSalida: { gte: inicio, lt: fin } },
    select: { ingredienteId: true, cantidad: true, fechaSalida: true },
  });
  for (const traslado of traslados)
    agregar(
      `INGREDIENTE:${traslado.ingredienteId}`,
      traslado.cantidad,
      traslado.fechaSalida,
      traslado.fechaSalida,
      'TRASLADO',
    );
  const salidasIngredientes = await db.movimientoInventario.findMany({
    where: {
      OR: [
        { tipo_movimiento: { in: ['MERMA', 'SALIDA_MANUAL'] } },
        {
          tipo_movimiento: 'TRANSFERENCIA',
          motivo_movimiento: { startsWith: 'Remisión #' },
        },
      ],
      fecha_movimiento: { gte: inicio, lt: fin },
    },
    select: {
      id_ingrediente_movimiento: true,
      tipo_movimiento: true,
      cantidad_movimiento: true,
      fecha_movimiento: true,
    },
  });
  for (const salida of salidasIngredientes)
    agregar(
      `INGREDIENTE:${salida.id_ingrediente_movimiento}`,
      salida.cantidad_movimiento,
      salida.fecha_movimiento,
      salida.fecha_movimiento,
      salida.tipo_movimiento === 'MERMA'
        ? 'MERMA'
        : salida.tipo_movimiento === 'TRANSFERENCIA'
          ? 'TRASLADO'
          : 'JUSTIFICADA',
    );
  const productosJustificados = await db.salidaProductoRestaurante.findMany({
    where: { fecha: { gte: inicio, lt: fin } },
    select: { productoId: true, cantidad: true, fecha: true },
  });
  for (const salida of productosJustificados)
    agregar(
      `PRODUCTO:${salida.productoId}`,
      salida.cantidad,
      salida.fecha,
      salida.fecha,
      'JUSTIFICADA',
    );
  return dias;
}

export async function actividadRestauranteEnRango(
  db: Prisma.TransactionClient,
  inicio: Date,
  fin: Date,
) {
  const [movimientos, produccion, recepciones, salidasProductos] =
    await Promise.all([
      db.movimientoInventario.findMany({
        where: { fecha_movimiento: { gte: inicio, lt: fin } },
        select: { id_ingrediente_movimiento: true, fecha_movimiento: true },
      }),
      db.planProduccionDiaria.findMany({
        where: {
          estado_planProduccion: 'PRODUCIDO',
          fecha_resolucion_planProduccion: { gte: inicio, lt: fin },
        },
        select: {
          id_producto_planProduccion: true,
          id_ingrediente_planProduccion: true,
          fecha_resolucion_planProduccion: true,
        },
      }),
      db.detalleCuentaPorPagar.findMany({
        where: {
          id_producto_detalleCuenta: { not: null },
          cuentaPorPagar: {
            fecha_recepcion_mercancia: { gte: inicio, lt: fin },
          },
        },
        select: {
          id_producto_detalleCuenta: true,
          cuentaPorPagar: { select: { fecha_recepcion_mercancia: true } },
        },
      }),
      db.salidaProductoRestaurante.findMany({
        where: { fecha: { gte: inicio, lt: fin } },
        select: { productoId: true, fecha: true },
      }),
    ]);
  const dias = new Map<string, Map<string, Date>>();
  const agregar = (clave: string, fecha: Date | null) => {
    if (!fecha) return;
    const dia = fechaColombia(fecha).toISOString().slice(0, 10);
    const objetivos = dias.get(dia) ?? new Map<string, Date>();
    dias.set(dia, objetivos);
    if (!objetivos.has(clave) || objetivos.get(clave)! < fecha)
      objetivos.set(clave, fecha);
  };
  for (const m of movimientos)
    agregar(`INGREDIENTE:${m.id_ingrediente_movimiento}`, m.fecha_movimiento);
  for (const p of produccion)
    agregar(
      `${p.id_producto_planProduccion !== null ? 'PRODUCTO' : 'INGREDIENTE'}:${p.id_producto_planProduccion ?? p.id_ingrediente_planProduccion}`,
      p.fecha_resolucion_planProduccion,
    );
  for (const r of recepciones)
    agregar(
      `PRODUCTO:${r.id_producto_detalleCuenta}`,
      r.cuentaPorPagar.fecha_recepcion_mercancia,
    );
  for (const salida of salidasProductos)
    agregar(`PRODUCTO:${salida.productoId}`, salida.fecha);
  return dias;
}

export function compararConteo(
  conteo: ConteoInventarioDiario,
  salidas: Map<string, Salida>,
  actividad?: Map<string, Date>,
) {
  const clave = `${conteo.tipo_objetivo_conteoInventario}:${conteo.id_producto_conteoInventario ?? conteo.id_ingrediente_conteoInventario}`;
  const salida = salidas.get(clave);
  const cantidadSistema = salida?.cantidad ?? new Prisma.Decimal(0);
  const faltaDiaAnterior =
    conteo.fecha_anterior_conteoInventario != null &&
    conteo.fecha_conteoInventario.getTime() -
      conteo.fecha_anterior_conteoInventario.getTime() !==
      86400000;
  const motivoNoComparable = salida?.sinFecha
    ? 'Hay entregas antiguas sin fecha exacta; no es posible conciliar este día.'
    : faltaDiaAnterior
      ? 'El saldo corresponde a un cierre anterior al día previo. No permite una comparación diaria exacta.'
      : null;
  const ultimaActividad = [salida?.ultima, actividad?.get(clave)]
    .filter((f): f is Date => !!f)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const requiereReconteo =
    conteo.estado_conteoInventario === 'FINALIZADO' &&
    !!ultimaActividad &&
    !!conteo.fecha_finalizacion_conteoInventario &&
    ultimaActividad > conteo.fecha_finalizacion_conteoInventario;
  const diferencia =
    !motivoNoComparable && conteo.cantidad_salida_conteoInventario !== null
      ? conteo.cantidad_salida_conteoInventario
          .minus(cantidadSistema)
          .toDecimalPlaces(4)
      : null;
  return {
    cantidadSistema: cantidadSistema.toString(),
    cantidadJustificada: (salida?.cantidadJustificada ?? new Prisma.Decimal(0))
      .plus(salida?.cantidadMerma ?? 0)
      .toString(),
    diferencia: diferencia?.toString() ?? null,
    estado: motivoNoComparable
      ? 'NO_COMPARABLE'
      : conteo.estado_conteoInventario === 'PENDIENTE'
        ? 'PENDIENTE'
        : requiereReconteo
          ? 'RECONTAR'
          : diferencia?.isZero()
            ? 'COINCIDE'
            : 'DIFERENCIA',
    motivoNoComparable,
    requiereReconteo,
  };
}

export async function estadoConteoCierre(
  db: Prisma.TransactionClient,
  fecha: Date,
) {
  const { inicio, fin } = rangoDia(fecha);
  const [elementos, conteos, salidas, actividad] = await Promise.all([
    db.elementoConteoDiario.findMany({
      where: {
        activo: true,
        fechaInicio: { lte: fecha },
        OR: [
          { ingrediente: { isNot: null } },
          { producto: { habilitado_producto: true } },
        ],
      },
      include: { producto: true, ingrediente: true },
    }),
    db.conteoInventarioDiario.findMany({
      where: { fecha_conteoInventario: fecha },
    }),
    salidasEntregadas(db, fecha),
    actividadRestauranteEnRango(db, inicio, fin),
  ]);
  const clave = (tipo: string, id: number | null) => `${tipo}:${id}`;
  const registrados = new Set(
    conteos.map((c) =>
      clave(
        c.tipo_objetivo_conteoInventario,
        c.id_producto_conteoInventario ?? c.id_ingrediente_conteoInventario,
      ),
    ),
  );
  const faltantes = elementos
    .filter(
      (e) => !registrados.has(clave(e.tipo, e.idProducto ?? e.idIngrediente)),
    )
    .map(
      (e) => e.producto?.nombre_producto ?? e.ingrediente!.nombre_ingrediente,
    );
  const detalle = conteos.map((c) => ({
    id: c.id_conteoInventario,
    nombre: c.nombre_objetivo_conteoInventario,
    ...compararConteo(
      c,
      salidas,
      actividad.get(fecha.toISOString().slice(0, 10)),
    ),
  }));
  const pendientes = conteos
    .filter((c) => c.estado_conteoInventario !== 'FINALIZADO')
    .map((c) => c.nombre_objetivo_conteoInventario);
  const recontar = detalle
    .filter((c) => c.requiereReconteo)
    .map((c) => c.nombre);
  const total = conteos.length + faltantes.length;
  return {
    fecha: fecha.toISOString().slice(0, 10),
    total,
    faltantes,
    pendientes,
    recontar,
    completo:
      total > 0 &&
      faltantes.length === 0 &&
      pendientes.length === 0 &&
      recontar.length === 0,
    inconsistencias: detalle.filter((c) => c.estado === 'DIFERENCIA').length,
    detalle,
  };
}
