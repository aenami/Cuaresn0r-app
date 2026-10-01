import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { Area } from '../auth/decorators/area.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  ActualizarCategoriaPanaderiaDto,
  CrearCategoriaPanaderiaDto,
} from './categorias-panaderia.dto';
import { CategoriasPanaderiaService } from './categorias-panaderia.service';

@Controller('/bakery/categorias')
@Area('PANADERIA')
@Roles('ADMIN_LOCAL')
export class CategoriasPanaderiaController {
  constructor(private readonly categorias: CategoriasPanaderiaService) {}

  @Get()
  listar() {
    return this.categorias.listar();
  }

  @Post()
  crear(@Body() dto: CrearCategoriaPanaderiaDto) {
    return this.categorias.crear(dto);
  }

  @Patch(':id')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarCategoriaPanaderiaDto,
  ) {
    return this.categorias.actualizar(id, dto);
  }
}
