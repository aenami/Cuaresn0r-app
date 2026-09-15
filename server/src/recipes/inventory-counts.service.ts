import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EstadoConteoInventario,
  Prisma,
  TipoObjetivoProduccion,
  UnidadIngrediente,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInventoryCountDto } from './dto/create-inventory-count.dto';

const CONTEO_INCLUDE = {
  producto: {
    select: {
      id_producto: true,
      nombre_producto: true,
      habilitado_producto: true,
    },
  },
  ingrediente: {
    select: {
      id_ingrediente: true,
      nombre_ingrediente: true,
      unidades_ingrediente: true,
      stock_ingrediente: true,
    },
  },
  usuarioCrea: {
    select: {
      id_usuario: true,
      email_usuario: true,
      empleado: {
        select: { nombre_empleado: true, apellido_empleado: true },
      },
    },
  },
  usuarioCierra: {
    select: {
      id_usuario: true,
      email_usuario: true,
      empleado: {
        select: { nombre_empleado: true, apellido_empleado: true },
      },
    },
  },
} satisfies Prisma.ConteoInventarioDiarioInclude;

type ConteoIncluido = Prisma.ConteoInventarioDiarioGetPayload<{
  include: typeof CONTEO_INCLUDE;
}>;

@Injectable()
export class InventoryCountsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(fecha?: string) {
    const fechaDb = fecha ? this.parsearFecha(fecha) : this.fechaDeHoy();
    const conteos = await this.prisma.conteoInventarioDiario.findMany({
      where: { fecha_conteoInventario: fechaDb },
      include: CONTEO_INCLUDE,
      orderBy: [
        { estado_conteoInventario: 'asc' },
        { tipo_objetivo_conteoInventario: 'desc' },
        { nombre_objetivo_conteoInventario: 'asc' },
      ],
    });

    return this.agregarEntradasEnCurso(conteos, fechaDb);
  }

  async create(dto: CreateInventoryCountDto, idUsuario: number) {
    const fecha = this.parsearFecha(dto.fecha);
    const objetivo = await this.obtenerObjetivo(dto.tipo, dto.idObjetivo);
    const filtroObjetivo = this.filtroObjetivo(dto.tipo, dto.idObjetivo);
    const anterior = await this.prisma.conteoInventarioDiario.findFirst({
      where: {
        ...filtroObjetivo,
        estado_conteoInventario: EstadoConteoInventario.FINALIZADO,
        fecha_conteoInventario: { lt: fecha },
      },
      orderBy: { fecha_conteoInventario: 'desc' },
    });

    let cantidadAnterior: Prisma.Decimal;
    if (anterior && anterior.cantidad_fisica_conteoInventario !== null) {
      cantidadAnterior = anterior.cantidad_fisica_conteoInventario;
    } else if (dto.cantidadInicial !== undefined) {
      cantidadAnterior = new Prisma.Decimal(dto.cantidadInicial);
    } else {
      throw new BadRequestException(
        'Este elemento no tiene un conteo anterior. Indica el saldo inicial para comenzar su historial',
      );
    }

    if (
      dto.tipo === TipoObjetivoProduccion.PRODUCTO &&
      !cantidadAnterior.isInteger()
    ) {
      throw new BadRequestException(
        'El saldo inicial de un producto debe ser un numero entero',
      );
    }

    try {
      const creado = await this.prisma.conteoInventarioDiario.create({
        data: {
          fecha_conteoInventario: fecha,
          tipo_objetivo_conteoInventario: dto.tipo,
          cantidad_anterior_conteoInventario: cantidadAnterior,
          fecha_anterior_conteoInventario:
            anterior?.fecha_conteoInventario ?? null,
          id_usuario_crea_conteoInventario: idUsuario,
          ...objetivo,
        },
        include: CONTEO_INCLUDE,
      });
      return (await this.agregarEntradasEnCurso([creado], fecha))[0];
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Ese elemento ya esta incluido en el conteo de la fecha seleccionada',
        );
      }
      throw error;
    }
  }

  async finalize(id: number, cantidadFisicaValor: number, idUsuario: number) {
    const cantidadFisica = new Prisma.Decimal(cantidadFisicaValor);
    if (cantidadFisica.isNegative()) {
      throw new BadRequestException('El conteo fisico no puede ser negativo');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id_conteoInventario"
        FROM "ConteoInventarioDiario"
        WHERE "id_conteoInventario" = ${id}
        FOR UPDATE
      `;
      const conteo = await tx.conteoInventarioDiario.findUnique({
        where: { id_conteoInventario: id },
      });
      if (!conteo) {
        throw new NotFoundException('Conteo de inventario no encontrado');
      }
      if (
        conteo.estado_conteoInventario === EstadoConteoInventario.FINALIZADO
      ) {
        return tx.conteoInventarioDiario.findUniqueOrThrow({
          where: { id_conteoInventario: id },
          include: CONTEO_INCLUDE,
        });
      }
      if (
        conteo.tipo_objetivo_conteoInventario ===
          TipoObjetivoProduccion.PRODUCTO &&
        !cantidadFisica.isInteger()
      ) {
        throw new BadRequestException(
          'El conteo fisico de un producto debe ser un numero entero',
        );
      }

      const { inicio, fin } = this.rangoLocalDelDia(
        conteo.fecha_conteoInventario,
      );
      const [entradas, produccion] = await Promise.all([
        conteo.tipo_objetivo_conteoInventario ===
        TipoObjetivoProduccion.INGREDIENTE
          ? tx.movimientoInventario.aggregate({
              where: {
                id_ingrediente_movimiento:
                  conteo.id_ingrediente_conteoInventario!,
                tipo_movimiento: 'ENTRADA',
                fecha_movimiento: { gte: inicio, lt: fin },
              },
              _sum: { cantidad_movimiento: true },
            })
          : tx.detalleCuentaPorPagar.aggregate({
              where: {
                id_producto_detalleCuenta: conteo.id_producto_conteoInventario!,
                cuentaPorPagar: {
                  fecha_recepcion_mercancia: { gte: inicio, lt: fin },
                },
              },
              _sum: { cantidad_detalleCuenta: true },
            }),
        tx.planProduccionDiaria.aggregate({
          where: {
            fecha_planProduccion: conteo.fecha_conteoInventario,
            estado_planProduccion: 'PRODUCIDO',
            ...(conteo.id_ingrediente_conteoInventario
              ? {
                  id_ingrediente_planProduccion:
                    conteo.id_ingrediente_conteoInventario,
                }
              : {
                  id_producto_planProduccion:
                    conteo.id_producto_conteoInventario!,
                }),
          },
          _sum: { cantidad_objetivo_planProduccion: true },
        }),
      ]);
      const entradasRecibidas =
        'cantidad_movimiento' in entradas._sum
          ? (entradas._sum.cantidad_movimiento ?? new Prisma.Decimal(0))
          : (entradas._sum.cantidad_detalleCuenta ?? new Prisma.Decimal(0));
      const cantidadEntradas = entradasRecibidas.plus(
        produccion._sum.cantidad_objetivo_planProduccion ?? 0,
      );
      const cantidadSalida = conteo.cantidad_anterior_conteoInventario
        .plus(cantidadEntradas)
        .minus(cantidadFisica);
      const ingrediente = conteo.id_ingrediente_conteoInventario
        ? await tx.ingrediente.findUnique({
            where: {
              id_ingrediente: conteo.id_ingrediente_conteoInventario,
            },
            select: { stock_ingrediente: true },
          })
        : null;

      return tx.conteoInventarioDiario.update({
        where: { id_conteoInventario: id },
        data: {
          cantidad_entradas_conteoInventario: cantidadEntradas,
          cantidad_fisica_conteoInventario: cantidadFisica,
          cantidad_salida_conteoInventario: cantidadSalida,
          stock_sistema_conteoInventario:
            ingrediente?.stock_ingrediente ?? null,
          estado_conteoInventario: EstadoConteoInventario.FINALIZADO,
          id_usuario_cierra_conteoInventario: idUsuario,
          fecha_finalizacion_conteoInventario: new Date(),
        },
        include: CONTEO_INCLUDE,
      });
    });
  }

  async reopen(id: number) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id_conteoInventario"
        FROM "ConteoInventarioDiario"
        WHERE "id_conteoInventario" = ${id}
        FOR UPDATE
      `;
      const conteo = await tx.conteoInventarioDiario.findUnique({
        where: { id_conteoInventario: id },
      });
      if (!conteo) {
        throw new NotFoundException('Conteo de inventario no encontrado');
      }
      if (conteo.estado_conteoInventario === EstadoConteoInventario.PENDIENTE) {
        return tx.conteoInventarioDiario.findUniqueOrThrow({
          where: { id_conteoInventario: id },
          include: CONTEO_INCLUDE,
        });
      }

      const posteriores = await tx.conteoInventarioDiario.count({
        where: {
          ...this.filtroObjetivo(
            conteo.tipo_objetivo_conteoInventario,
            conteo.id_producto_conteoInventario ??
              conteo.id_ingrediente_conteoInventario!,
          ),
          fecha_conteoInventario: { gt: conteo.fecha_conteoInventario },
        },
      });
      if (posteriores > 0) {
        throw new ConflictException(
          'No se puede reabrir porque ya existe un conteo posterior para este elemento',
        );
      }

      return tx.conteoInventarioDiario.update({
        where: { id_conteoInventario: id },
        data: {
          cantidad_entradas_conteoInventario: 0,
          cantidad_fisica_conteoInventario: null,
          cantidad_salida_conteoInventario: null,
          stock_sistema_conteoInventario: null,
          estado_conteoInventario: EstadoConteoInventario.PENDIENTE,
          id_usuario_cierra_conteoInventario: null,
          fecha_finalizacion_conteoInventario: null,
        },
        include: CONTEO_INCLUDE,
      });
    });
  }

  async remove(id: number) {
    const conteo = await this.prisma.conteoInventarioDiario.findUnique({
      where: { id_conteoInventario: id },
    });
    if (!conteo) {
      throw new NotFoundException('Conteo de inventario no encontrado');
    }
    if (conteo.estado_conteoInventario !== EstadoConteoInventario.PENDIENTE) {
      throw new ConflictException(
        'Un conteo finalizado debe reabrirse antes de eliminarlo',
      );
    }
    return this.prisma.conteoInventarioDiario.delete({
      where: { id_conteoInventario: id },
    });
  }

  private async agregarEntradasEnCurso(conteos: ConteoIncluido[], fecha: Date) {
    const pendientes = conteos.filter(
      (conteo) =>
        conteo.estado_conteoInventario === EstadoConteoInventario.PENDIENTE,
    );
    if (pendientes.length === 0) return conteos;

    const idsIngredientes = pendientes.flatMap((conteo) =>
      conteo.id_ingrediente_conteoInventario
        ? [conteo.id_ingrediente_conteoInventario]
        : [],
    );
    const idsProductos = pendientes.flatMap((conteo) =>
      conteo.id_producto_conteoInventario
        ? [conteo.id_producto_conteoInventario]
        : [],
    );
    const { inicio, fin } = this.rangoLocalDelDia(fecha);
    const [
      entradasIngredientes,
      entradasProductos,
      produccionIngredientes,
      produccionProductos,
    ] = await Promise.all([
      idsIngredientes.length > 0
        ? this.prisma.movimientoInventario.groupBy({
            by: ['id_ingrediente_movimiento'],
            where: {
              id_ingrediente_movimiento: { in: idsIngredientes },
              tipo_movimiento: 'ENTRADA',
              fecha_movimiento: { gte: inicio, lt: fin },
            },
            _sum: { cantidad_movimiento: true },
          })
        : Promise.resolve([]),
      idsProductos.length > 0
        ? this.prisma.detalleCuentaPorPagar.groupBy({
            by: ['id_producto_detalleCuenta'],
            where: {
              id_producto_detalleCuenta: { in: idsProductos },
              cuentaPorPagar: {
                fecha_recepcion_mercancia: { gte: inicio, lt: fin },
              },
            },
            _sum: { cantidad_detalleCuenta: true },
          })
        : Promise.resolve([]),
      idsIngredientes.length > 0
        ? this.prisma.planProduccionDiaria.groupBy({
            by: ['id_ingrediente_planProduccion'],
            where: {
              fecha_planProduccion: fecha,
              estado_planProduccion: 'PRODUCIDO',
              id_ingrediente_planProduccion: { in: idsIngredientes },
            },
            _sum: { cantidad_objetivo_planProduccion: true },
          })
        : Promise.resolve([]),
      idsProductos.length > 0
        ? this.prisma.planProduccionDiaria.groupBy({
            by: ['id_producto_planProduccion'],
            where: {
              fecha_planProduccion: fecha,
              estado_planProduccion: 'PRODUCIDO',
              id_producto_planProduccion: { in: idsProductos },
            },
            _sum: { cantidad_objetivo_planProduccion: true },
          })
        : Promise.resolve([]),
    ]);
    const porIngrediente = new Map(
      entradasIngredientes.map((entrada) => [
        entrada.id_ingrediente_movimiento,
        entrada._sum.cantidad_movimiento ?? new Prisma.Decimal(0),
      ]),
    );
    const porProducto = new Map(
      entradasProductos.flatMap((entrada) =>
        entrada.id_producto_detalleCuenta
          ? [
              [
                entrada.id_producto_detalleCuenta,
                entrada._sum.cantidad_detalleCuenta ?? new Prisma.Decimal(0),
              ] as const,
            ]
          : [],
      ),
    );
    for (const entrada of produccionIngredientes) {
      if (entrada.id_ingrediente_planProduccion === null) continue;
      porIngrediente.set(
        entrada.id_ingrediente_planProduccion,
        (
          porIngrediente.get(entrada.id_ingrediente_planProduccion) ??
          new Prisma.Decimal(0)
        ).plus(entrada._sum.cantidad_objetivo_planProduccion ?? 0),
      );
    }
    for (const entrada of produccionProductos) {
      if (entrada.id_producto_planProduccion === null) continue;
      porProducto.set(
        entrada.id_producto_planProduccion,
        (
          porProducto.get(entrada.id_producto_planProduccion) ??
          new Prisma.Decimal(0)
        ).plus(entrada._sum.cantidad_objetivo_planProduccion ?? 0),
      );
    }

    return conteos.map((conteo) =>
      conteo.estado_conteoInventario === EstadoConteoInventario.FINALIZADO
        ? conteo
        : {
            ...conteo,
            cantidad_entradas_conteoInventario:
              (conteo.id_ingrediente_conteoInventario
                ? porIngrediente.get(conteo.id_ingrediente_conteoInventario)
                : porProducto.get(conteo.id_producto_conteoInventario!)) ??
              new Prisma.Decimal(0),
          },
    );
  }

  private async obtenerObjetivo(
    tipo: TipoObjetivoProduccion,
    idObjetivo: number,
  ): Promise<{
    id_producto_conteoInventario?: number;
    id_ingrediente_conteoInventario?: number;
    nombre_objetivo_conteoInventario: string;
    unidad_objetivo_conteoInventario: UnidadIngrediente;
  }> {
    if (tipo === TipoObjetivoProduccion.PRODUCTO) {
      const producto = await this.prisma.producto.findUnique({
        where: { id_producto: idObjetivo },
      });
      if (!producto || !producto.habilitado_producto) {
        throw new NotFoundException('Producto habilitado no encontrado');
      }
      return {
        id_producto_conteoInventario: producto.id_producto,
        nombre_objetivo_conteoInventario: producto.nombre_producto,
        unidad_objetivo_conteoInventario: 'UNIDADES',
      };
    }

    const ingrediente = await this.prisma.ingrediente.findUnique({
      where: { id_ingrediente: idObjetivo },
    });
    if (!ingrediente) {
      throw new NotFoundException('Ingrediente no encontrado');
    }
    return {
      id_ingrediente_conteoInventario: ingrediente.id_ingrediente,
      nombre_objetivo_conteoInventario: ingrediente.nombre_ingrediente,
      unidad_objetivo_conteoInventario: ingrediente.unidades_ingrediente,
    };
  }

  private filtroObjetivo(tipo: TipoObjetivoProduccion, idObjetivo: number) {
    return tipo === TipoObjetivoProduccion.PRODUCTO
      ? { id_producto_conteoInventario: idObjetivo }
      : { id_ingrediente_conteoInventario: idObjetivo };
  }

  private fechaDeHoy() {
    const ahora = new Date();
    return new Date(
      Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()),
    );
  }

  private parsearFecha(fecha: string) {
    const coincidencia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
    if (!coincidencia) {
      throw new BadRequestException('La fecha debe tener formato AAAA-MM-DD');
    }
    const [, anioTexto, mesTexto, diaTexto] = coincidencia;
    const anio = Number(anioTexto);
    const mes = Number(mesTexto);
    const dia = Number(diaTexto);
    const resultado = new Date(Date.UTC(anio, mes - 1, dia));
    if (
      resultado.getUTCFullYear() !== anio ||
      resultado.getUTCMonth() !== mes - 1 ||
      resultado.getUTCDate() !== dia
    ) {
      throw new BadRequestException('La fecha no es valida');
    }
    return resultado;
  }

  private rangoLocalDelDia(fecha: Date) {
    // Colombia usa UTC-5 sin horario de verano. Las fechas operativas se
    // guardan como DATE UTC y los movimientos como instantes Timestamp.
    const inicio = new Date(
      Date.UTC(
        fecha.getUTCFullYear(),
        fecha.getUTCMonth(),
        fecha.getUTCDate(),
        5,
      ),
    );
    return { inicio, fin: new Date(inicio.getTime() + 24 * 60 * 60 * 1000) };
  }
}
