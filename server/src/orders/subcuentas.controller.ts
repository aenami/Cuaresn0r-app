import { Controller, Get, Post, Body, Param, Patch, ParseIntPipe } from '@nestjs/common';
import { SubcuentasService } from './subcuentas.service';
import { CreateSubcuentaDto } from './dto/create-subcuenta.dto';
import { ReassignItemDto } from './dto/reassign-item.dto';
import { SplitItemDto } from './dto/split-item.dto';

@Controller('/orders/:idPedido')
export class SubcuentasController {
  constructor(private readonly subcuentasService: SubcuentasService) {}

  @Post('subcuentas')
  create(@Param('idPedido', ParseIntPipe) idPedido: number, @Body() createSubcuentaDto: CreateSubcuentaDto) {
    return this.subcuentasService.create(idPedido, createSubcuentaDto);
  }

  @Get('subcuentas')
  findAll(@Param('idPedido', ParseIntPipe) idPedido: number) {
    return this.subcuentasService.findAll(idPedido);
  }

  @Patch('items/:idItem/subcuenta')
  reasignar(
    @Param('idPedido', ParseIntPipe) idPedido: number,
    @Param('idItem', ParseIntPipe) idItem: number,
    @Body() reassignItemDto: ReassignItemDto,
  ) {
    return this.subcuentasService.reasignar(idPedido, idItem, reassignItemDto.idSubcuenta);
  }

  @Post('items/:idItem/reparto')
  repartir(
    @Param('idPedido', ParseIntPipe) idPedido: number,
    @Param('idItem', ParseIntPipe) idItem: number,
    @Body() splitItemDto: SplitItemDto,
  ) {
    return this.subcuentasService.repartir(idPedido, idItem, splitItemDto.reparto);
  }
}
