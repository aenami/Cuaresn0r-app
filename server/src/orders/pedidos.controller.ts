import { Controller, Get, Post, Body, Param, Patch, ParseIntPipe, Query, Req } from '@nestjs/common';
import { PedidosService } from './pedidos.service';
import { CreatePedidoDto } from './dto/create-pedido.dto';
import { AsignarFichaDto } from './dto/asignar-ficha.dto';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { EstadoPedido, TipoPedido } from '../generated/prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('/orders')
export class PedidosController {
  constructor(private readonly pedidosService: PedidosService) {}

  @Post()
  create(@Body() createPedidoDto: CreatePedidoDto, @Req() req: AuthenticatedRequest) {
    return this.pedidosService.create(req.user.id, createPedidoDto);
  }

  @Get()
  findAll(
    @Query('estado') estado?: EstadoPedido,
    @Query('ficha') ficha?: string,
    @Query('tipo') tipo?: TipoPedido,
  ) {
    return this.pedidosService.findAll(estado, ficha !== undefined ? Number(ficha) : undefined, tipo);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.pedidosService.findOne(id);
  }

  @Patch(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number) {
    return this.pedidosService.cancel(id);
  }

  @Patch(':id/ficha')
  @Roles('ADMIN', 'CAJERO')
  asignarFicha(@Param('id', ParseIntPipe) id: number, @Body() dto: AsignarFichaDto) {
    return this.pedidosService.asignarFicha(id, dto.idFicha);
  }
}
