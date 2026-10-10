import {
  Body,
  Controller,
  Patch,
  Param,
  ParseIntPipe,
  Req,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { ItemsService } from './items.service';
import { ActualizarIndicacionesDto } from './dto/actualizar-indicaciones.dto';

@Controller('/orders/:idPedido/items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Patch(':idItem/entregar')
  entregar(
    @Param('idPedido', ParseIntPipe) idPedido: number,
    @Param('idItem', ParseIntPipe) idItem: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.itemsService.entregar(idPedido, idItem, req.user.id);
  }

  @Patch(':idItem/indicaciones')
  actualizarIndicaciones(
    @Param('idPedido', ParseIntPipe) idPedido: number,
    @Param('idItem', ParseIntPipe) idItem: number,
    @Body() dto: ActualizarIndicacionesDto,
  ) {
    return this.itemsService.actualizarIndicaciones(
      idPedido,
      idItem,
      dto.indicaciones,
    );
  }

  @Patch(':idItem/cancelar')
  cancelar(
    @Param('idPedido', ParseIntPipe) idPedido: number,
    @Param('idItem', ParseIntPipe) idItem: number,
  ) {
    return this.itemsService.cancelar(idPedido, idItem);
  }
}
