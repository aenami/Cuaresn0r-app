import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ImpresorasService } from './impresoras.service';
import { ImpresionService } from './impresion.service';
import { CreateImpresoraDto } from './dto/create-impresora.dto';
import { UpdateImpresoraDto } from './dto/update-impresora.dto';
import { Roles } from '../auth/decorators/roles.decorator';

// La configuracion de impresoras es infraestructura del local: solo ADMIN.
@Roles('ADMIN')
@Controller('/printing/impresoras')
export class ImpresorasController {
  constructor(
    private readonly impresorasService: ImpresorasService,
    private readonly impresionService: ImpresionService,
  ) {}

  @Post()
  create(@Body() dto: CreateImpresoraDto) {
    return this.impresorasService.create(dto);
  }

  @Get()
  findAll() {
    return this.impresorasService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.impresorasService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateImpresoraDto) {
    return this.impresorasService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.impresorasService.remove(id);
  }

  // Imprime un ticket de prueba para validar la conexion.
  @Post(':id/test')
  probar(@Param('id', ParseIntPipe) id: number) {
    return this.impresionService.probarImpresora(id);
  }
}
