import { Controller, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ImpresionService } from './impresion.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { DestinoImpresion } from '../generated/prisma/client';

// Reimprimir lo puede hacer cualquier rol operativo: es el mesero/cajero
// quien se topa con el papel atascado o la impresora apagada.
@Controller('/printing/comandas')
export class ImpresionesController {
  constructor(private readonly impresionService: ImpresionService) {}

  @Post(':idComanda/reimprimir')
  reimprimir(
    @Param('idComanda', ParseIntPipe) idComanda: number,
    @Query('destino') destino?: DestinoImpresion,
  ) {
    return this.impresionService.imprimirComanda(idComanda, true, destino);
  }
}

// La factura del cliente la imprime la caja (cajero o admin).
@Roles('ADMIN', 'CAJERO')
@Controller('/printing/facturas')
export class ImpresionFacturasController {
  constructor(private readonly impresionService: ImpresionService) {}

  @Post(':idFactura')
  imprimir(@Param('idFactura', ParseIntPipe) idFactura: number) {
    return this.impresionService.imprimirFactura(idFactura);
  }
}
