import { Controller, Get, Post, Body, Param, Patch, ParseIntPipe } from '@nestjs/common';
import { ConceptosService } from './conceptos.service';
import { CreateConceptoDto } from './dto/create-concepto.dto';
import { UpdateConceptoDto } from './dto/update-concepto.dto';
import { CreateValorConceptoDto } from './dto/create-valor-concepto.dto';
import { Roles } from '../auth/decorators/roles.decorator';

@Roles('ADMIN')
@Controller('/payroll/conceptos')
export class ConceptosController {
  constructor(private readonly conceptosService: ConceptosService) {}

  @Post()
  create(@Body() createConceptoDto: CreateConceptoDto) {
    return this.conceptosService.create(createConceptoDto);
  }

  @Get()
  findAll() {
    return this.conceptosService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.conceptosService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() updateConceptoDto: UpdateConceptoDto) {
    return this.conceptosService.update(id, updateConceptoDto);
  }

  @Get(':id/valores')
  findValores(@Param('id', ParseIntPipe) id: number) {
    return this.conceptosService.findValores(id);
  }

  @Post(':id/valores')
  crearValor(@Param('id', ParseIntPipe) id: number, @Body() createValorConceptoDto: CreateValorConceptoDto) {
    return this.conceptosService.crearValor(id, createValorConceptoDto);
  }
}
