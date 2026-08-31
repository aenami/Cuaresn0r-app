import { Controller, Patch, Param, ParseIntPipe } from '@nestjs/common';
import { ItemsService } from './items.service';

@Controller('/orders/:idPedido/items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Patch(':idItem/entregar')
  entregar(@Param('idPedido', ParseIntPipe) idPedido: number, @Param('idItem', ParseIntPipe) idItem: number) {
    return this.itemsService.entregar(idPedido, idItem);
  }

  @Patch(':idItem/cancelar')
  cancelar(@Param('idPedido', ParseIntPipe) idPedido: number, @Param('idItem', ParseIntPipe) idItem: number) {
    return this.itemsService.cancelar(idPedido, idItem);
  }
}
