import { Body, Controller, Patch, Param, ParseIntPipe } from '@nestjs/common';
import { ItemsService } from './items.service';
import { ActualizarIndicacionesDto } from './dto/actualizar-indicaciones.dto';

@Controller('/orders/:idPedido/items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Patch(':idItem/entregar')
  entregar(@Param('idPedido', ParseIntPipe) idPedido: number, @Param('idItem', ParseIntPipe) idItem: number) {
    return this.itemsService.entregar(idPedido, idItem);
  }

  @Patch(':idItem/indicaciones')
  actualizarIndicaciones(
    @Param('idPedido', ParseIntPipe) idPedido: number,
    @Param('idItem', ParseIntPipe) idItem: number,
    @Body() dto: ActualizarIndicacionesDto,
  ) {
    return this.itemsService.actualizarIndicaciones(idPedido, idItem, dto.indicaciones);
  }

  @Patch(':idItem/cancelar')
  cancelar(@Param('idPedido', ParseIntPipe) idPedido: number, @Param('idItem', ParseIntPipe) idItem: number) {
    return this.itemsService.cancelar(idPedido, idItem);
  }
}
