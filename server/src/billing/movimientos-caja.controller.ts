import { Controller, Post, Body, Req } from '@nestjs/common';
import { MovimientosCajaService } from './movimientos-caja.service';
import { CreateMovimientoCajaDto } from './dto/create-movimiento-caja.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';

// La consulta de movimientos vive en el detalle del turno
// (GET /billing/turnos/:id incluye movimientosCaja).
@Roles('ADMIN', 'CAJERO')
@Controller('/billing/movimientos')
export class MovimientosCajaController {
  constructor(private readonly movimientosCajaService: MovimientosCajaService) {}

  @Post()
  registrar(@Body() createMovimientoCajaDto: CreateMovimientoCajaDto, @Req() req: AuthenticatedRequest) {
    return this.movimientosCajaService.registrar(req.user.id, createMovimientoCajaDto);
  }
}
