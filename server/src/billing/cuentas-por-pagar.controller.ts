import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Req } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { CuentasPorPagarService } from './cuentas-por-pagar.service';
import { CrearCuentaPorPagarDto } from './dto/crear-cuenta-por-pagar.dto';
import { PagarCuentaPorPagarDto } from './dto/pagar-cuenta-por-pagar.dto';

@Roles('ADMIN', 'CAJERO')
@Controller('/billing/cuentas-por-pagar')
export class CuentasPorPagarController {
  constructor(private readonly cuentas: CuentasPorPagarService) {}

  @Get()
  listar() {
    return this.cuentas.listar();
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.cuentas.obtener(id);
  }

  @Post()
  @Roles('ADMIN')
  crear(@Body() dto: CrearCuentaPorPagarDto) {
    return this.cuentas.crear(dto);
  }

  @Patch(':id/recibir')
  recibir(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest) {
    return this.cuentas.recibirMercancia(id, req.user.id);
  }

  @Post(':id/pagos')
  pagar(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest, @Body() dto: PagarCuentaPorPagarDto) {
    return this.cuentas.pagar(id, req.user.id, dto);
  }
}
