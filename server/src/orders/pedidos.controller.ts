import { Controller, Get, Post, Body, Param, Patch, ParseIntPipe, Query, Req } from '@nestjs/common';
import { PedidosService } from './pedidos.service';
import { CreatePedidoDto } from './dto/create-pedido.dto';
import { TransferirMesaDto } from './dto/transferir-mesa.dto';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { EstadoPedido, TipoPedido } from '../generated/prisma/client';

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
    @Query('mesa') mesa?: string,
    @Query('tipo') tipo?: TipoPedido,
  ) {
    return this.pedidosService.findAll(estado, mesa !== undefined ? Number(mesa) : undefined, tipo);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.pedidosService.findOne(id);
  }

  @Patch(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number) {
    return this.pedidosService.cancel(id);
  }

  // Reubicacion fisica: mueve el pedido (y sus cuentas/comandas/facturas) a otra
  // mesa libre, liberando la mesa de origen.
  @Patch(':id/transferir')
  transferir(@Param('id', ParseIntPipe) id: number, @Body() dto: TransferirMesaDto) {
    return this.pedidosService.transferir(id, dto.idMesaDestino);
  }
}
