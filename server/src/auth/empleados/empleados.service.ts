import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEmpleadoDto } from './dto/create-empleado.dto';
import { UpdateEmpleadoDto } from './dto/update-empleado.dto';
import { EstadoEmpleado } from '../../generated/prisma/client';
import {
  accessContext,
  areaActual,
  esGlobal,
  exigirArea,
} from '../access-context';

@Injectable()
export class EmpleadosService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateEmpleadoDto) {
    return this.prisma.empleado.create({
      data: {
        area: areaActual(),
        nombre_empleado: dto.nombre,
        apellido_empleado: dto.apellido,
        fecha_ingreso_empleado: dto.fechaIngreso
          ? new Date(dto.fechaIngreso)
          : new Date(),
      },
    });
  }

  async findAll(estado?: EstadoEmpleado) {
    return this.prisma.empleado.findMany({
      where: { area: areaActual(), ...(estado && { estado_empleado: estado }) },
      orderBy: { id_empleado: 'asc' },
    });
  }

  async findOne(id: number) {
    const empleado = await this.prisma.empleado.findUnique({
      where: { id_empleado: id },
    });
    if (!empleado) throw new NotFoundException('Empleado no encontrado');
    exigirArea(empleado.area);
    return empleado;
  }

  async update(id: number, dto: UpdateEmpleadoDto) {
    await this.findOne(id);
    await this.exigirGestionPermitida(id);
    return this.prisma.empleado.update({
      where: { id_empleado: id },
      data: {
        ...(dto.nombre !== undefined && { nombre_empleado: dto.nombre }),
        ...(dto.apellido !== undefined && { apellido_empleado: dto.apellido }),
        ...(dto.fechaIngreso !== undefined && {
          fecha_ingreso_empleado: new Date(dto.fechaIngreso),
        }),
      },
    });
  }

  // Revoca de inmediato el acceso del Usuario asociado (se valida estado_empleado en el login).
  async deactivate(id: number) {
    await this.findOne(id);
    await this.exigirGestionPermitida(id);
    return this.prisma.$transaction(async (tx) => {
      // Mismo bloqueo compartido con UsuariosService: serializa desactivaciones,
      // eliminaciones y cambios de rol que puedan retirar acceso administrativo.
      const filasRol = await tx.$queryRaw<{ id_rol: number }[]>`
        SELECT id_rol FROM "Rol" WHERE nombre_rol IN ('ADMIN_GLOBAL', 'ADMIN') ORDER BY id_rol FOR UPDATE
      `;
      if (!filasRol[0])
        throw new ConflictException(
          'El rol ADMIN no esta configurado en el sistema',
        );

      const empleado = await tx.empleado.findUnique({
        where: { id_empleado: id },
      });
      if (!empleado) throw new NotFoundException('Empleado no encontrado');

      // Proteccion del ultimo admin: si este empleado tiene un usuario ADMIN y
      // esta ACTIVO, desactivarlo revocaria su acceso de inmediato.
      if (empleado.estado_empleado === 'ACTIVO') {
        const usuarioAdmin = await tx.usuario.findFirst({
          where: {
            id_empleado_usuario: id,
            rol: { nombre_rol: { in: ['ADMIN_GLOBAL', 'ADMIN'] } },
          },
          select: { id_usuario: true },
        });
        if (usuarioAdmin) {
          const adminsActivos = await tx.usuario.count({
            where: {
              rol: { nombre_rol: { in: ['ADMIN_GLOBAL', 'ADMIN'] } },
              empleado: { estado_empleado: 'ACTIVO' },
            },
          });
          if (adminsActivos <= 1) {
            throw new ConflictException(
              'No puedes desactivar al ultimo administrador activo del sistema.',
            );
          }
        }
      }

      return tx.empleado.update({
        where: { id_empleado: id },
        data: {
          estado_empleado: 'INACTIVO',
          fecha_retiro_empleado: new Date(),
        },
      });
    });
  }

  async reactivate(id: number) {
    await this.findOne(id);
    await this.exigirGestionPermitida(id);
    return this.prisma.empleado.update({
      where: { id_empleado: id },
      data: { estado_empleado: 'ACTIVO', fecha_retiro_empleado: null },
    });
  }
  private async exigirGestionPermitida(id: number) {
    const actor = accessContext.getStore()?.user;
    if (!actor || esGlobal(actor.rolNombre)) return;
    const global = await this.prisma.usuario.findFirst({
      where: {
        id_empleado_usuario: id,
        rol: { nombre_rol: { in: ['ADMIN_GLOBAL', 'ADMIN'] } },
      },
    });
    if (global)
      throw new ConflictException(
        'Solo el administrador global puede gestionar al personal con acceso global',
      );
  }
}
