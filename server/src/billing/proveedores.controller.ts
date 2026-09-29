import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { Area } from '../auth/decorators/area.decorator';
import { CrearProveedorDto } from './dto/crear-proveedor.dto';
import { ProveedoresService } from './proveedores.service';

@Controller('/billing/proveedores')
@Area('AMBAS')
export class ProveedoresController {
  constructor(private readonly proveedores: ProveedoresService) {}

  @Get()
  @Roles('ADMIN', 'CAJERO')
  listar() {
    return this.proveedores.listar();
  }

  @Post()
  @Roles('ADMIN', 'CAJERO')
  crear(@Body() dto: CrearProveedorDto) {
    return this.proveedores.crear(dto);
  }

  @Patch(':id/activar')
  @Roles('ADMIN')
  activar(@Param('id', ParseIntPipe) id: number) {
    return this.proveedores.cambiarEstado(id, true);
  }

  @Patch(':id/desactivar')
  @Roles('ADMIN')
  desactivar(@Param('id', ParseIntPipe) id: number) {
    return this.proveedores.cambiarEstado(id, false);
  }
}
