import { Body, Controller, Get, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { Area } from '../auth/decorators/area.decorator';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { BakeryService } from './bakery.service';
import { CrearTransferenciaRestauranteDto, PagarTransferenciaRestauranteDto } from './dto';

@Roles('ADMIN', 'CAJERO')
@Area('AMBAS')
@Controller('/interarea/restaurante-panaderia')
export class TransferenciasRestauranteController {
  constructor(private readonly bakery: BakeryService) {}

  @Get()
  listar() { return this.bakery.listarTransferenciasRestaurante(); }

  @Roles('ADMIN')
  @Post()
  crear(@Req() req: AuthenticatedRequest, @Body() dto: CrearTransferenciaRestauranteDto) {
    return this.bakery.crearTransferenciaRestaurante(req.user.id, dto);
  }

  @Area('PANADERIA')
  @Post(':id/recibir')
  recibir(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest) {
    return this.bakery.recibirTransferenciaRestaurante(id, req.user.id);
  }

  @Area('PANADERIA')
  @Post(':id/pagar')
  pagar(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest,
    @Body() dto: PagarTransferenciaRestauranteDto) {
    return this.bakery.pagarTransferenciaRestaurante(id, req.user.id, dto);
  }

  @Area('RESTAURANTE')
  @Post(':id/confirmar-ingreso')
  confirmarIngreso(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest) {
    return this.bakery.confirmarIngresoRestaurante(id, req.user.id);
  }
}
