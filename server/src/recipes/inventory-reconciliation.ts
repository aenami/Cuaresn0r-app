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

type Salida = {
  cantidad: Prisma.Decimal;
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
      movimientosInventario: {
        where: { tipo_movimiento: 'SALIDA_RECETA', reversos: { none: {} } },
        select: { id_ingrediente_movimiento: true, cantidad_movimiento: true },
      },
    },
  });
  const salidas = new Map<string, Salida>();
  const agregar = (
    clave: string,
    cantidad: Prisma.Decimal | number,
    entrega: Date | null,
  ) => {
    const anterior = salidas.get(clave) ?? {
      cantidad: new Prisma.Decimal(0),
      ultima: null,
      sinFecha: false,
    };
    if (entrega) {
      anterior.cantidad = anterior.cantidad.plus(cantidad);
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
      );
    for (const movimiento of detalle.movimientosInventario)
      agregar(
        `INGREDIENTE:${movimiento.id_ingrediente_movimiento}`,
        movimiento.cantidad_movimiento,
        detalle.fecha_entrega_dc,
      );
  }
  return salidas;
}

export function compararConteo(
  conteo: ConteoInventarioDiario,
  salidas: Map<string, Salida>,
) {
  const clave = `${conteo.tipo_objetivo_conteoInventario}:${conteo.id_producto_conteoInventario ?? conteo.id_ingrediente_conteoInventario}`;
  const salida = salidas.get(clave);
  const cantidadSistema = salida?.cantidad ?? new Prisma.Decimal(0);
  const faltaDiaAnterior =
    conteo.fecha_anterior_conteoInventario !== null &&
    conteo.fecha_conteoInventario.getTime() -
      conteo.fecha_anterior_conteoInventario.getTime() !==
      86400000;
  const motivoNoComparable = salida?.sinFecha
    ? 'Hay entregas antiguas sin fecha exacta; no es posible conciliar este día.'
    : faltaDiaAnterior
      ? 'El saldo corresponde a un cierre anterior al día previo. No permite una comparación diaria exacta.'
      : null;
  const requiereReconteo =
    conteo.estado_conteoInventario === 'FINALIZADO' &&
    !!salida?.ultima &&
    !!conteo.fecha_finalizacion_conteoInventario &&
    salida.ultima > conteo.fecha_finalizacion_conteoInventario;
  const diferencia =
    !motivoNoComparable && conteo.cantidad_salida_conteoInventario !== null
      ? conteo.cantidad_salida_conteoInventario
          .minus(cantidadSistema)
          .toDecimalPlaces(4)
      : null;
  return {
    cantidadSistema: cantidadSistema.toString(),
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
  const [elementos, conteos, salidas] = await Promise.all([
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
    ...compararConteo(c, salidas),
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
