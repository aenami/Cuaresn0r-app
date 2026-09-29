import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { areaActual } from '../auth/access-context';
import { PrismaService } from '../prisma/prisma.service';
import {
  actividadRestauranteEnRango,
  compararConteo,
  fechaColombia,
  rangoDia,
  salidasEntregadasEnRango,
} from './inventory-reconciliation';
import { leerValoracion, ValoracionConteo } from './inventory-valuation';

type Importes = {
  ingresoEstimado: string;
  costoConsumido: string;
  perdidaEstimada: string;
  valorSobrante: string;
};
type Fila = Importes & {
  tipo: 'PRODUCTO' | 'INGREDIENTE';
  tipoReferencia: ValoracionConteo['tipoReferencia'];
  idObjetivo: number;
  nombre: string;
  unidad: string;
  diasValorados: number;
};
type MotivoExclusion =
  | 'sinValoracion'
  | 'pendientes'
  | 'noComparables'
  | 'sinReferencia'
  | 'recontar';
type Entrada = {
  idObjetivo: number;
  tipo: Fila['tipo'];
  valoracion: unknown;
  exclusion?: MotivoExclusion;
};

const importesVacios = (): Importes => ({
  ingresoEstimado: '0',
  costoConsumido: '0',
  perdidaEstimada: '0',
  valorSobrante: '0',
});
const camposImportes = [
  'ingresoEstimado',
  'costoConsumido',
  'perdidaEstimada',
  'valorSobrante',
] as const;

export function rangoMes(mes: string) {
  const coincidencia = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(mes);
  if (
    !coincidencia ||
    Number(coincidencia[1]) < 2000 ||
    Number(coincidencia[1]) > 9998
  )
    throw new BadRequestException(
      'El mes debe tener formato AAAA-MM y un año entre 2000 y 9998',
    );
  const anio = Number(coincidencia[1]);
  const numeroMes = Number(coincidencia[2]);
  return {
    fechaInicio: new Date(Date.UTC(anio, numeroMes - 1, 1)),
    fechaFin: new Date(Date.UTC(anio, numeroMes, 1)),
  };
}

export function rangoFechas(desde?: string, hasta?: string) {
  const validar = (valor: string | undefined) => {
    if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor))
      throw new BadRequestException(
        'Indica ambas fechas con formato AAAA-MM-DD',
      );
    const anio = Number(valor.slice(0, 4));
    const fecha = new Date(`${valor}T00:00:00.000Z`);
    if (
      anio < 2000 ||
      anio > 9998 ||
      !Number.isFinite(fecha.getTime()) ||
      fecha.toISOString().slice(0, 10) !== valor
    )
      throw new BadRequestException(
        'Las fechas deben ser válidas, con un año entre 2000 y 9998',
      );
    return fecha;
  };
  const fechaInicio = validar(desde);
  const fechaUltima = validar(hasta);
  const dias = (fechaUltima.getTime() - fechaInicio.getTime()) / 86400000 + 1;
  if (dias < 1)
    throw new BadRequestException(
      'La fecha inicial no puede ser posterior a la final',
    );
  if (dias > 366)
    throw new BadRequestException('El rango no puede superar 366 días');
  return {
    fechaInicio,
    // Los días se almacenan como DATE; las actividades usan instantes en UTC-5.
    // Un límite superior exclusivo permite incluir el último día completo.
    fechaFin: new Date(fechaUltima.getTime() + 86400000),
  };
}

// Los importes conservados son la única fuente monetaria del informe. Leer el
// precio actual o reconstruir datos antiguos falsearía el historial.
export function agregarValoraciones(entradas: Entrada[]) {
  const filas = new Map<string, Fila>();
  const totales = importesVacios();
  const separados = {
    perdidaProductos: new Prisma.Decimal(0),
    perdidaIngredientes: new Prisma.Decimal(0),
    sobranteProductos: new Prisma.Decimal(0),
    sobranteIngredientes: new Prisma.Decimal(0),
  };
  const excluidos: Record<MotivoExclusion, number> = {
    sinValoracion: 0,
    pendientes: 0,
    noComparables: 0,
    sinReferencia: 0,
    recontar: 0,
  };
  for (const entrada of entradas) {
    const valoracion = leerValoracion(entrada.valoracion);
    const exclusion =
      entrada.exclusion ??
      (!valoracion
        ? 'sinValoracion'
        : valoracion.estado === 'NO_COMPARABLE'
          ? 'noComparables'
          : valoracion.estado === 'SIN_REFERENCIA'
            ? 'sinReferencia'
            : undefined);
    if (exclusion) {
      excluidos[exclusion]++;
      continue;
    }
    if (!valoracion || valoracion.estado !== 'VALIDA') {
      excluidos.sinValoracion++;
      continue;
    }
    const clave = `${entrada.tipo}:${entrada.idObjetivo}:${valoracion.tipoReferencia}`;
    const fila = filas.get(clave) ?? {
      tipo: entrada.tipo,
      tipoReferencia: valoracion.tipoReferencia,
      idObjetivo: entrada.idObjetivo,
      nombre: valoracion.nombre,
      unidad: valoracion.unidad,
      diasValorados: 0,
      ...importesVacios(),
    };
    fila.diasValorados++;
    for (const campo of camposImportes) {
      fila[campo] = new Prisma.Decimal(fila[campo])
        .plus(valoracion[campo] ?? 0)
        .toString();
      totales[campo] = new Prisma.Decimal(totales[campo])
        .plus(valoracion[campo] ?? 0)
        .toString();
    }
    const esProducto = valoracion.tipoReferencia === 'PRECIO_VENTA';
    const perdida = esProducto ? 'perdidaProductos' : 'perdidaIngredientes';
    const sobrante = esProducto ? 'sobranteProductos' : 'sobranteIngredientes';
    separados[perdida] = separados[perdida].plus(
      valoracion.perdidaEstimada ?? 0,
    );
    separados[sobrante] = separados[sobrante].plus(
      valoracion.valorSobrante ?? 0,
    );
    filas.set(clave, fila);
  }
  return {
    filas: [...filas.values()].sort(
      (a, b) =>
        new Prisma.Decimal(b.perdidaEstimada).comparedTo(a.perdidaEstimada) ||
        a.nombre.localeCompare(b.nombre),
    ),
    totales: {
      ...totales,
      perdidaProductos: separados.perdidaProductos.toString(),
      perdidaIngredientes: separados.perdidaIngredientes.toString(),
      sobranteProductos: separados.sobranteProductos.toString(),
      sobranteIngredientes: separados.sobranteIngredientes.toString(),
    },
    excluidos,
  };
}

@Injectable()
export class InventoryValuationService {
  constructor(private readonly prisma: PrismaService) {}

  async monthly(mes?: string) {
    const mesElegido = mes ?? fechaColombia().toISOString().slice(0, 7);
    const { fechaInicio, fechaFin } = rangoMes(mesElegido);
    return {
      mes: mesElegido,
      ...(await this.summary(fechaInicio, fechaFin)),
    };
  }

  async range(desde?: string, hasta?: string) {
    const { fechaInicio, fechaFin } = rangoFechas(desde, hasta);
    return {
      desde: fechaInicio.toISOString().slice(0, 10),
      hasta: new Date(fechaFin.getTime() - 86400000).toISOString().slice(0, 10),
      ...(await this.summary(fechaInicio, fechaFin)),
    };
  }

  private async summary(fechaInicio: Date, fechaFin: Date) {
    const inicio = rangoDia(fechaInicio).inicio;
    const fin = rangoDia(fechaFin).inicio;
    const area = areaActual();
    const entradas: Entrada[] = [];
    if (area === 'PANADERIA') {
      const [conteos, movimientos] = await Promise.all([
        this.prisma.conteoPanaderia.findMany({
          where: { fecha: { gte: fechaInicio, lt: fechaFin } },
          orderBy: { fecha: 'asc' },
        }),
        this.prisma.movimientoPanaderia.findMany({
          where: {
            fecha: { gte: inicio, lt: fin },
            tipo: { not: 'AJUSTE_CONTEO' },
          },
          select: { articuloId: true, fecha: true },
        }),
      ]);
      const ultimas = new Map<string, Date>();
      for (const m of movimientos) {
        const clave = `${fechaColombia(m.fecha).toISOString().slice(0, 10)}:${m.articuloId}`;
        if (!ultimas.has(clave) || ultimas.get(clave)! < m.fecha)
          ultimas.set(clave, m.fecha);
      }
      for (const c of conteos) {
        const ultima = ultimas.get(
          `${c.fecha.toISOString().slice(0, 10)}:${c.articuloId}`,
        );
        entradas.push({
          idObjetivo: c.articuloId,
          tipo:
            leerValoracion(c.valoracion)?.tipoReferencia === 'COSTO_UNITARIO'
              ? 'INGREDIENTE'
              : 'PRODUCTO',
          valoracion: c.valoracion,
          ...(ultima && ultima > c.fechaRegistro
            ? { exclusion: 'recontar' as const }
            : {}),
        });
      }
    } else {
      const [conteos, salidas, actividad] = await Promise.all([
        this.prisma.conteoInventarioDiario.findMany({
          where: { fecha_conteoInventario: { gte: fechaInicio, lt: fechaFin } },
          orderBy: { fecha_conteoInventario: 'asc' },
        }),
        salidasEntregadasEnRango(this.prisma, inicio, fin),
        actividadRestauranteEnRango(this.prisma, inicio, fin),
      ]);
      for (const c of conteos) {
        const dia = c.fecha_conteoInventario.toISOString().slice(0, 10);
        const conciliacion = compararConteo(
          c,
          salidas.get(dia) ?? new Map(),
          actividad.get(dia),
        );
        const exclusion =
          c.estado_conteoInventario === 'PENDIENTE'
            ? 'pendientes'
            : conciliacion.requiereReconteo
              ? 'recontar'
              : conciliacion.estado === 'NO_COMPARABLE'
                ? 'noComparables'
                : undefined;
        entradas.push({
          idObjetivo:
            c.id_producto_conteoInventario ??
            c.id_ingrediente_conteoInventario!,
          tipo: c.tipo_objetivo_conteoInventario,
          valoracion: c.valoracion,
          exclusion,
        });
      }
    }
    return { area, ...agregarValoraciones(entradas) };
  }
}
