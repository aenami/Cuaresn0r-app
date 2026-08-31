import { Controller, Get, Post, Body, Param, ParseIntPipe, Req } from '@nestjs/common';
import { PagosService } from './pagos.service';
import { CreatePagoDto } from './dto/create-pago.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';

@Roles('ADMIN', 'CAJERO')
@Controller('/billing/facturas/:idFactura/pagos')
export class PagosController {
  constructor(private readonly pagosService: PagosService) {}

  // El turno al que entra el pago sale del usuario autenticado, no del body.
  @Post()
  registrar(
    @Param('idFactura', ParseIntPipe) idFactura: number,
    @Body() createPagoDto: CreatePagoDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.pagosService.registrar(idFactura, req.user.id, createPagoDto);
  }

  @Get()
  findByFactura(@Param('idFactura', ParseIntPipe) idFactura: number) {
    return this.pagosService.findByFactura(idFactura);
  }
}
