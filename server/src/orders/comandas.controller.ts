import { Controller, Post, Body, Param, Patch, ParseIntPipe, Req } from '@nestjs/common';
import { ComandasService } from './comandas.service';
import { CreateComandaDto } from './dto/create-comanda.dto';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';

@Controller('/orders/:idPedido/comandas')
export class ComandasController {
  constructor(private readonly comandasService: ComandasService) {}

  @Post()
  create(@Param('idPedido', ParseIntPipe) idPedido: number, @Body() createComandaDto: CreateComandaDto) {
    return this.comandasService.create(idPedido, createComandaDto);
  }

  @Patch(':idComanda/enviar')
  enviar(
    @Param('idPedido', ParseIntPipe) idPedido: number,
    @Param('idComanda', ParseIntPipe) idComanda: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.comandasService.enviar(idPedido, idComanda, req.user.id, req.user.rolNombre);
  }

  @Patch(':idComanda/entregar')
  entregar(@Param('idPedido', ParseIntPipe) idPedido: number, @Param('idComanda', ParseIntPipe) idComanda: number) {
    return this.comandasService.entregarComanda(idPedido, idComanda);
  }
}
