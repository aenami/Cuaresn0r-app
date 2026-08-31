import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEmpleadoDto } from './dto/create-empleado.dto';
import { UpdateEmpleadoDto } from './dto/update-empleado.dto';
import { EstadoEmpleado } from '../../generated/prisma/client';

@Injectable()
export class EmpleadosService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateEmpleadoDto) {
    return this.prisma.empleado.create({
      data: {
        nombre_empleado: dto.nombre,
        apellido_empleado: dto.apellido,
        fecha_ingreso_empleado: dto.fechaIngreso ? new Date(dto.fechaIngreso) : new Date(),
      },
    });
  }

  async findAll(estado?: EstadoEmpleado) {
    return this.prisma.empleado.findMany({
      where: estado ? { estado_empleado: estado } : undefined,
      orderBy: { id_empleado: 'asc' },
    });
  }

  async findOne(id: number) {
    const empleado = await this.prisma.empleado.findUnique({ where: { id_empleado: id } });
    if (!empleado) throw new NotFoundException('Empleado no encontrado');
    return empleado;
  }

  async update(id: number, dto: UpdateEmpleadoDto) {
    await this.findOne(id);
    return this.prisma.empleado.update({
      where: { id_empleado: id },
      data: {
        ...(dto.nombre !== undefined && { nombre_empleado: dto.nombre }),
        ...(dto.apellido !== undefined && { apellido_empleado: dto.apellido }),
        ...(dto.fechaIngreso !== undefined && { fecha_ingreso_empleado: new Date(dto.fechaIngreso) }),
      },
    });
  }

  // Revoca de inmediato el acceso del Usuario asociado (se valida estado_empleado en el login).
  async deactivate(id: number) {
    await this.findOne(id);

    // Proteccion del ultimo admin: si este empleado tiene un usuario ADMIN y es
    // el unico administrador activo, desactivarlo dejaria el sistema sin acceso
    // de administracion (el guard exige empleado ACTIVO en cada request).
    const usuarioAdmin = await this.prisma.usuario.findFirst({
      where: { id_empleado_usuario: id, rol: { nombre_rol: 'ADMIN' } },
      select: { id_usuario: true },
    });
    if (usuarioAdmin) {
      const adminsActivos = await this.prisma.usuario.count({
        where: { rol: { nombre_rol: 'ADMIN' }, empleado: { estado_empleado: 'ACTIVO' } },
      });
      if (adminsActivos <= 1) {
        throw new ConflictException('No puedes desactivar al ultimo administrador activo del sistema.');
      }
    }

    return this.prisma.empleado.update({
      where: { id_empleado: id },
      data: { estado_empleado: 'INACTIVO', fecha_retiro_empleado: new Date() },
    });
  }

  async reactivate(id: number) {
    await this.findOne(id);
    return this.prisma.empleado.update({
      where: { id_empleado: id },
      data: { estado_empleado: 'ACTIVO', fecha_retiro_empleado: null },
    });
  }
}
