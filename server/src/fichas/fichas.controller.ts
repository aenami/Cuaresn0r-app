import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { ActualizarFichaDto } from './dto/actualizar-ficha.dto';
import { CrearFichaDto } from './dto/crear-ficha.dto';
import { FichasService } from './fichas.service';

@Controller('/fichas')
export class FichasController {
  constructor(private readonly fichasService: FichasService) {}

  @Get()
  listar() {
    return this.fichasService.listar();
  }

  @Post()
  @Roles('ADMIN')
  crear(@Body() dto: CrearFichaDto) {
    return this.fichasService.crear(dto.numero);
  }

  @Patch(':id')
  @Roles('ADMIN')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarFichaDto) {
    return this.fichasService.actualizar(id, dto);
  }
}
