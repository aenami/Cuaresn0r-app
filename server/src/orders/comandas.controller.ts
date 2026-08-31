import { Controller, Post, Body, Param, Patch, ParseIntPipe } from '@nestjs/common';
import { ComandasService } from './comandas.service';
import { CreateComandaDto } from './dto/create-comanda.dto';

@Controller('/orders/:idPedido/comandas')
export class ComandasController {
  constructor(private readonly comandasService: ComandasService) {}

  @Post()
  create(@Param('idPedido', ParseIntPipe) idPedido: number, @Body() createComandaDto: CreateComandaDto) {
    return this.comandasService.create(idPedido, createComandaDto);
  }

  @Patch(':idComanda/entregar')
  entregar(@Param('idPedido', ParseIntPipe) idPedido: number, @Param('idComanda', ParseIntPipe) idComanda: number) {
    return this.comandasService.entregarComanda(idPedido, idComanda);
  }
}
