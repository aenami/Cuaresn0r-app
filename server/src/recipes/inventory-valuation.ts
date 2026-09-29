import { Prisma } from '../generated/prisma/client';

export type EstadoValoracion =
  | 'VALIDA'
  | 'NO_COMPARABLE'
  | 'SIN_REFERENCIA'
  | 'PENDIENTE'
  | 'RECONTAR'
  | 'SIN_VALORACION_HISTORICA';

export interface ValoracionConteo {
  version: 1;
  estado: EstadoValoracion;
  tipoReferencia: 'PRECIO_VENTA' | 'COSTO_UNITARIO';
  precioReferencia: string | null;
  nombre: string;
  unidad: string;
  fechaValoracion: string;
  salidaFisicaEstimada: string;
  cantidadReconocida: string;
  cantidadFaltante: string;
  cantidadSobrante: string;
  ingresoEstimado: string | null;
  costoConsumido: string | null;
  perdidaEstimada: string | null;
  valorSobrante: string | null;
  motivo?: string;
}

type Decimal = Prisma.Decimal | number | string;
const cero = new Prisma.Decimal(0);
const positivo = (cantidad: Prisma.Decimal) =>
  Prisma.Decimal.max(cero, cantidad);

// Una salida física sin venta/consumo corroborado es un faltante, no dinero
// ingresado. Esto no registra ventas, cobros, utilidad ni ajustes de existencias.
export function crearValoracion(datos: {
  tipoReferencia: ValoracionConteo['tipoReferencia'];
  precioReferencia: Decimal | null;
  nombre: string;
  unidad: string;
  salidaFisica: Decimal;
  cantidadCorroborada: Decimal;
  salidasNoValorables?: Decimal;
  motivoNoComparable?: string | null;
  fechaValoracion?: Date;
}): ValoracionConteo {
  const salida = new Prisma.Decimal(datos.salidaFisica);
  const neta = salida.minus(datos.salidasNoValorables ?? 0);
  const corroborada = new Prisma.Decimal(datos.cantidadCorroborada);
  const diferencia = neta.minus(corroborada).toDecimalPlaces(4);
  const reconocida = positivo(Prisma.Decimal.min(neta, corroborada));
  const faltante = positivo(diferencia);
  const sobrante = positivo(diferencia.negated());
  const precio =
    datos.precioReferencia === null
      ? null
      : new Prisma.Decimal(datos.precioReferencia);
  const estado = datos.motivoNoComparable
    ? 'NO_COMPARABLE'
    : precio === null
      ? 'SIN_REFERENCIA'
      : 'VALIDA';
  const importe = (cantidad: Prisma.Decimal) =>
    estado === 'VALIDA'
      ? cantidad.times(precio!).toDecimalPlaces(4).toString()
      : null;
  return {
    version: 1,
    estado,
    tipoReferencia: datos.tipoReferencia,
    precioReferencia: precio?.toString() ?? null,
    nombre: datos.nombre,
    unidad: datos.unidad,
    fechaValoracion: (datos.fechaValoracion ?? new Date()).toISOString(),
    salidaFisicaEstimada: salida.toString(),
    cantidadReconocida: reconocida.toString(),
    cantidadFaltante: faltante.toString(),
    cantidadSobrante: sobrante.toString(),
    ingresoEstimado:
      datos.tipoReferencia === 'PRECIO_VENTA'
        ? importe(reconocida)
        : estado === 'VALIDA'
          ? '0'
          : null,
    costoConsumido:
      datos.tipoReferencia === 'COSTO_UNITARIO'
        ? importe(reconocida)
        : estado === 'VALIDA'
          ? '0'
          : null,
    perdidaEstimada: importe(faltante),
    valorSobrante: importe(sobrante),
    ...(datos.motivoNoComparable
      ? { motivo: datos.motivoNoComparable }
      : precio === null
        ? {
            motivo:
              'Configura el costo por unidad antes de confirmar de nuevo el conteo.',
          }
        : {}),
  };
}

export function leerValoracion(valor: unknown): ValoracionConteo | null {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
  const datos = valor as Partial<ValoracionConteo>;
  if (
    datos.version !== 1 ||
    !['PRECIO_VENTA', 'COSTO_UNITARIO'].includes(datos.tipoReferencia ?? '') ||
    !['VALIDA', 'NO_COMPARABLE', 'SIN_REFERENCIA'].includes(
      datos.estado ?? '',
    ) ||
    typeof datos.fechaValoracion !== 'string'
  )
    return null;
  if (
    typeof datos.nombre !== 'string' ||
    typeof datos.unidad !== 'string' ||
    !Number.isFinite(new Date(datos.fechaValoracion).getTime())
  )
    return null;
  for (const campo of [
    'precioReferencia',
    'salidaFisicaEstimada',
    'cantidadReconocida',
    'cantidadFaltante',
    'cantidadSobrante',
    'ingresoEstimado',
    'costoConsumido',
    'perdidaEstimada',
    'valorSobrante',
  ] as const) {
    const numero = datos[campo];
    if (
      numero === null &&
      [
        'precioReferencia',
        'ingresoEstimado',
        'costoConsumido',
        'perdidaEstimada',
        'valorSobrante',
      ].includes(campo)
    ) {
      if (datos.estado === 'VALIDA') return null;
      continue;
    }
    if (typeof numero !== 'string') return null;
    try {
      if (!new Prisma.Decimal(numero).isFinite()) return null;
    } catch {
      return null;
    }
  }
  return datos as ValoracionConteo;
}

export function presentarValoracion(
  valor: unknown,
  estadoOperativo?: string,
  motivo?: string | null,
) {
  const guardada = leerValoracion(valor);
  if (
    estadoOperativo === 'PENDIENTE' ||
    estadoOperativo === 'RECONTAR' ||
    estadoOperativo === 'NO_COMPARABLE'
  ) {
    return {
      ...(guardada ?? {}),
      estado: estadoOperativo as EstadoValoracion,
      ingresoEstimado: null,
      costoConsumido: null,
      perdidaEstimada: null,
      valorSobrante: null,
      ...(motivo ? { motivo } : {}),
    };
  }
  return (
    guardada ?? {
      estado: 'SIN_VALORACION_HISTORICA' as const,
      ingresoEstimado: null,
      costoConsumido: null,
      perdidaEstimada: null,
      valorSobrante: null,
      motivo:
        'Este conteo no conserva una valoración histórica. No se reconstruye con precios actuales.',
    }
  );
}
