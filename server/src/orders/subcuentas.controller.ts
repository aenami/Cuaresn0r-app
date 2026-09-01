import { Controller, Get, Post, Body, Param, Patch, ParseIntPipe, Req } from '@nestjs/common';
import { SubcuentasService } from './subcuentas.service';
import { CreateSubcuentaDto } from './dto/create-subcuenta.dto';
import { ReassignItemDto } from './dto/reassign-item.dto';
import { SplitItemDto } from './dto/split-item.dto';
import { CrearComentarioCuentaDto } from './dto/crear-comentario-cuenta.dto';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';

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

  @Post('subcuentas/:idSubcuenta/comentarios')
  crearComentario(
    @Param('idPedido', ParseIntPipe) idPedido: number,
    @Param('idSubcuenta', ParseIntPipe) idSubcuenta: number,
    @Body() dto: CrearComentarioCuentaDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.subcuentasService.crearComentario(idPedido, idSubcuenta, req.user.id, dto.texto);
  }

  @Patch('subcuentas/:idSubcuenta/comentarios/:idComentario/resolver')
  resolverComentario(
    @Param('idPedido', ParseIntPipe) idPedido: number,
    @Param('idSubcuenta', ParseIntPipe) idSubcuenta: number,
    @Param('idComentario', ParseIntPipe) idComentario: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.subcuentasService.resolverComentario(idPedido, idSubcuenta, idComentario, req.user.id);
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
