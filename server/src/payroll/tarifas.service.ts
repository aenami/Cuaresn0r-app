import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTarifaDto } from './dto/create-tarifa.dto';

@Injectable()
export class TarifasService {
  constructor(private readonly prisma: PrismaService) {}

  private async findEmpleado(idEmpleado: number) {
    const empleado = await this.prisma.empleado.findUnique({ where: { id_empleado: idEmpleado } });
    if (!empleado) throw new NotFoundException('Empleado no encontrado');
    return empleado;
  }

  async findByEmpleado(idEmpleado: number) {
    await this.findEmpleado(idEmpleado);
    return this.prisma.tarifaEmpleado.findMany({
      where: { id_empleado_tarifaEmpleado: idEmpleado },
      orderBy: { id_tarifaEmpleado: 'desc' },
    });
  }

  // Versionado (seccion 10): desactivar la vigente + insertar la nueva en la
  // misma transaccion. Los devengos ya generados no se recalculan: cada uno
  // snapshoteo el valor_hora que regia al cerrar su jornada.
  async crearVersion(idEmpleado: number, dto: CreateTarifaDto) {
    const empleado = await this.findEmpleado(idEmpleado);
    if (empleado.estado_empleado !== 'ACTIVO') {
      throw new ConflictException('No se puede asignar tarifa a un empleado inactivo');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.tarifaEmpleado.updateMany({
        where: { id_empleado_tarifaEmpleado: idEmpleado, tarifa_activa: true },
        data: { tarifa_activa: false },
      });
      return tx.tarifaEmpleado.create({
        data: {
          id_empleado_tarifaEmpleado: idEmpleado,
          valor_hora_tarifaEmpleado: dto.valorHora,
          ...(dto.fechaInicio !== undefined && { fecha_inicio_tarifaEmpleado: new Date(dto.fechaInicio) }),
        },
      });
    });
  }
}
