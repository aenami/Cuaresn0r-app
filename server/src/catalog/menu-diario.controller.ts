import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { fechaColombia } from '../recipes/inventory-reconciliation';

class OpcionDto {
  @IsIn(['CALDO', 'PRINCIPIO', 'PROTEINA']) grupo!: string;
  @IsInt() @Min(1) componenteId!: number;
}
class ConfigurarMenuDto {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) fecha!: string;
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => OpcionDto)
  opciones!: OpcionDto[];
}
const dia = (fecha?: string) => {
  if (fecha === undefined) return fechaColombia();
  const valor = new Date(fecha + 'T00:00:00Z');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(fecha) ||
    !Number.isFinite(valor.getTime()) ||
    valor.toISOString().slice(0, 10) !== fecha
  )
    throw new BadRequestException('Fecha inválida');
  return valor;
};
@Controller('/catalog/menu-diario')
export class MenuDiarioController {
  constructor(private readonly prisma: PrismaService) {}
  @Get() listar(@Query('fecha') fecha?: string) {
    return this.prisma.menuOpcionDiaria.findMany({
      where: {
        fecha: dia(fecha),
        producto: { habilitado_producto: true },
        componente: { habilitado_producto: true },
      },
      include: {
        componente: { select: { id_producto: true, nombre_producto: true } },
      },
      orderBy: { id: 'asc' },
    });
  }
  @Post(':id')
  @Roles('ADMIN_LOCAL')
  guardar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfigurarMenuDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const fecha = dia(dto.fecha);
      if (fecha < fechaColombia())
        throw new ConflictException('El menú de días pasados es histórico');
      await tx.$queryRaw`SELECT id_producto FROM "Producto" WHERE id_producto = ${id} FOR UPDATE`;
      const producto = await tx.producto.findUniqueOrThrow({
        where: { id_producto: id },
      });
      if (!producto.tipoMenu)
        throw new ConflictException('Selecciona un Ejecutivo o Bandeja');
      if (
        producto.tipoMenu === 'BANDEJA' &&
        dto.opciones.some((o) => o.grupo === 'CALDO')
      )
        throw new ConflictException('La Bandeja no incluye caldo');
      const claves = dto.opciones.map((o) => o.grupo + ':' + o.componenteId);
      if (new Set(claves).size !== claves.length)
        throw new ConflictException('No repitas opciones dentro de un grupo');
      const ids = [...new Set(dto.opciones.map((o) => o.componenteId))];
      const validos = await tx.producto.count({
        where: {
          id_producto: { in: ids },
          habilitado_producto: true,
          tipoMenu: null,
          articuloCompartidoId: null,
          recetas: { some: { receta_activa: true } },
        },
      });
      if (validos !== ids.length)
        throw new ConflictException(
          'Cada opción debe ser un producto con receta activa, sin menú ni stock compartido',
        );
      await tx.menuOpcionDiaria.deleteMany({
        where: { productoId: id, fecha },
      });
      await tx.menuOpcionDiaria.createMany({
        data: dto.opciones.map((o) => ({ ...o, productoId: id, fecha })),
      });
      return { guardado: true };
    });
  }
}
