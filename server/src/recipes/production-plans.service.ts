import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EstadoMetaProduccion,
  Prisma,
  TipoObjetivoProduccion,
  UnidadIngrediente,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductionPlanDto } from './dto/create-production-plan.dto';

const PLAN_INCLUDE = {
  producto: { select: { id_producto: true, nombre_producto: true, habilitado_producto: true } },
  ingrediente: {
    select: { id_ingrediente: true, nombre_ingrediente: true, unidades_ingrediente: true },
  },
  usuarioCrea: {
    select: {
      id_usuario: true,
      email_usuario: true,
      empleado: { select: { nombre_empleado: true, apellido_empleado: true } },
    },
  },
  usuarioResuelve: {
    select: {
      id_usuario: true,
      email_usuario: true,
      empleado: { select: { nombre_empleado: true, apellido_empleado: true } },
    },
  },
} satisfies Prisma.PlanProduccionDiariaInclude;

@Injectable()
export class ProductionPlansService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(fecha?: string) {
    const fechaDb = fecha ? this.parsearFecha(fecha) : this.fechaDeHoy();
    return this.prisma.planProduccionDiaria.findMany({
      where: { fecha_planProduccion: fechaDb },
      include: PLAN_INCLUDE,
      orderBy: [
        { estado_planProduccion: 'asc' },
        { tipo_objetivo_planProduccion: 'desc' },
        { nombre_objetivo_planProduccion: 'asc' },
      ],
    });
  }

  async create(dto: CreateProductionPlanDto, idUsuario: number) {
    const fecha = this.parsearFecha(dto.fecha);
    const cantidad = new Prisma.Decimal(dto.cantidad);
    if (cantidad.lessThanOrEqualTo(0)) throw new BadRequestException('La cantidad debe ser mayor que cero');

    let dataObjetivo: {
      id_producto_planProduccion?: number;
      id_ingrediente_planProduccion?: number;
      nombre_objetivo_planProduccion: string;
      unidad_objetivo_planProduccion: UnidadIngrediente;
    };

    if (dto.tipo === TipoObjetivoProduccion.PRODUCTO) {
      if (!Number.isInteger(dto.cantidad)) {
        throw new BadRequestException('La cantidad de un producto debe ser un numero entero');
      }
      const producto = await this.prisma.producto.findUnique({ where: { id_producto: dto.idObjetivo } });
      if (!producto || !producto.habilitado_producto) {
        throw new NotFoundException('Producto habilitado no encontrado');
      }
      dataObjetivo = {
        id_producto_planProduccion: producto.id_producto,
        nombre_objetivo_planProduccion: producto.nombre_producto,
        unidad_objetivo_planProduccion: 'UNIDADES',
      };
    } else {
      const ingrediente = await this.prisma.ingrediente.findUnique({ where: { id_ingrediente: dto.idObjetivo } });
      if (!ingrediente) throw new NotFoundException('Ingrediente no encontrado');
      dataObjetivo = {
        id_ingrediente_planProduccion: ingrediente.id_ingrediente,
        nombre_objetivo_planProduccion: ingrediente.nombre_ingrediente,
        unidad_objetivo_planProduccion: ingrediente.unidades_ingrediente,
      };
    }

    try {
      return await this.prisma.planProduccionDiaria.create({
        data: {
          fecha_planProduccion: fecha,
          tipo_objetivo_planProduccion: dto.tipo,
          cantidad_objetivo_planProduccion: cantidad,
          id_usuario_crea_planProduccion: idUsuario,
          ...dataObjetivo,
        },
        include: PLAN_INCLUDE,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya existe una meta para ese elemento en la fecha seleccionada');
      }
      throw error;
    }
  }

  async actualizarEstado(
    id: number,
    estado: EstadoMetaProduccion,
    idUsuario: number,
    esAdmin: boolean,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Serializa dos confirmaciones simultaneas: el segundo empleado ya ve la
      // decision final y no puede reemplazarla sin permisos de administrador.
      await tx.$queryRaw`
        SELECT "id_planProduccion"
        FROM "PlanProduccionDiaria"
        WHERE "id_planProduccion" = ${id}
        FOR UPDATE
      `;
      const actual = await tx.planProduccionDiaria.findUnique({
        where: { id_planProduccion: id },
      });
      if (!actual) throw new NotFoundException('Meta de produccion no encontrada');
      if (actual.estado_planProduccion === estado) {
        return tx.planProduccionDiaria.findUniqueOrThrow({
          where: { id_planProduccion: id },
          include: PLAN_INCLUDE,
        });
      }

      const estabaResuelta = actual.estado_planProduccion !== EstadoMetaProduccion.PENDIENTE;
      if (estado === EstadoMetaProduccion.PENDIENTE && !esAdmin) {
        throw new ForbiddenException('Solo un administrador puede reabrir una meta');
      }
      if (estabaResuelta && !esAdmin) {
        throw new ForbiddenException('Solo un administrador puede corregir una meta ya resuelta');
      }

      return tx.planProduccionDiaria.update({
        where: { id_planProduccion: id },
        data:
          estado === EstadoMetaProduccion.PENDIENTE
            ? {
                estado_planProduccion: estado,
                id_usuario_resuelve_planProduccion: null,
                fecha_resolucion_planProduccion: null,
              }
            : {
                estado_planProduccion: estado,
                id_usuario_resuelve_planProduccion: idUsuario,
                fecha_resolucion_planProduccion: new Date(),
              },
        include: PLAN_INCLUDE,
      });
    });
  }

  async remove(id: number) {
    const actual = await this.prisma.planProduccionDiaria.findUnique({
      where: { id_planProduccion: id },
    });
    if (!actual) throw new NotFoundException('Meta de produccion no encontrada');
    if (actual.estado_planProduccion !== EstadoMetaProduccion.PENDIENTE) {
      throw new ConflictException('Reabre la meta antes de eliminarla para conservar el historial diario');
    }
    return this.prisma.planProduccionDiaria.delete({ where: { id_planProduccion: id } });
  }

  private fechaDeHoy() {
    const ahora = new Date();
    return new Date(Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()));
  }

  private parsearFecha(fecha: string) {
    const coincidencia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
    if (!coincidencia) throw new BadRequestException('La fecha debe tener formato AAAA-MM-DD');
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
}
