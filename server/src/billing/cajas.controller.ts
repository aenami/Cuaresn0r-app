import { Controller, Get, Post, Body, Param, Patch, ParseIntPipe } from '@nestjs/common';
import { CajasService } from './cajas.service';
import { CreateCajaDto } from './dto/create-caja.dto';
import { UpdateCajaDto } from './dto/update-caja.dto';
import { Roles } from '../auth/decorators/roles.decorator';

// CAJERO puede listar (necesita elegir caja para abrir su turno); solo ADMIN
// crea o renombra.
@Roles('ADMIN', 'CAJERO')
@Controller('/billing/cajas')
export class CajasController {
  constructor(private readonly cajasService: CajasService) {}

  @Roles('ADMIN')
  @Post()
  create(@Body() createCajaDto: CreateCajaDto) {
    return this.cajasService.create(createCajaDto);
  }

  @Get()
  findAll() {
    return this.cajasService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.cajasService.findOne(id);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() updateCajaDto: UpdateCajaDto) {
    return this.cajasService.update(id, updateCajaDto);
  }
}
