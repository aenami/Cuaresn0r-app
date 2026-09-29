import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CrearProveedorDto } from './dto/crear-proveedor.dto';
import { areaActual, exigirArea } from '../auth/access-context';

@Injectable()
export class ProveedoresService {
  constructor(private readonly prisma: PrismaService) {}

  listar() {
    return this.prisma.proveedor.findMany({ where: { area: areaActual() }, orderBy: { nombre_proveedor: 'asc' } });
  }

  async crear(dto: CrearProveedorDto) {
    try {
      return await this.prisma.proveedor.create({
        data: {
          area: areaActual(),
          nombre_proveedor: dto.nombre.trim(),
          contacto_proveedor: dto.contacto,
          telefono_proveedor: dto.telefono,
          nit_proveedor: dto.nit,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya existe un proveedor con ese nombre');
      }
      throw error;
    }
  }

  async cambiarEstado(idProveedor: number, activo: boolean) {
    const proveedor = await this.prisma.proveedor.findUnique({ where: { id_proveedor: idProveedor } });
    if (!proveedor) throw new NotFoundException('Proveedor no encontrado');
    exigirArea(proveedor.area);
    return this.prisma.proveedor.update({
      where: { id_proveedor: idProveedor },
      data: { proveedor_activo: activo },
    });
  }
}
