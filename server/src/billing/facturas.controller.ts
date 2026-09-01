import { Controller, Get, Post, Body, Param, Patch, ParseIntPipe, Query, Req } from '@nestjs/common';
import { FacturasService } from './facturas.service';
import { CreateFacturaDto } from './dto/create-factura.dto';
import { AnularFacturaDto } from './dto/anular-factura.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { EstadoFactura } from '../generated/prisma/client';

@Roles('ADMIN', 'CAJERO')
@Controller('/billing/facturas')
export class FacturasController {
  constructor(private readonly facturasService: FacturasService) {}

  @Post()
  emitir(@Body() createFacturaDto: CreateFacturaDto) {
    return this.facturasService.emitir(
      createFacturaDto.idSubcuenta,
      createFacturaDto.porcentajePropina,
      createFacturaDto.montoServicio,
      createFacturaDto.idsDetalle,
    );
  }

  @Get()
  findAll(
    @Query('estado') estado?: EstadoFactura,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('pedido', new ParseIntPipe({ optional: true })) pedido?: number,
  ) {
    return this.facturasService.findAll(estado, desde, hasta, pedido);
  }

  // Reporte de cuentas cobradas (factura PAGADA) con su detalle: ficha, montos,
  // metodos de pago y productos consumidos. Ruta estatica antes de ':id'.
  @Get('pagadas')
  findPagadas(@Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    return this.facturasService.findCuentasPagadas(desde, hasta);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.facturasService.findOne(id);
  }

  // Tambien CAJERO: es quien se topa con los cobros errados en el momento.
  // La devolucion queda trazada (motivo + EGRESO en su turno).
  @Patch(':id/anular')
  anular(
    @Param('id', ParseIntPipe) id: number,
    @Body() anularFacturaDto: AnularFacturaDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.facturasService.anular(id, anularFacturaDto.motivo, req.user.id);
  }
}
