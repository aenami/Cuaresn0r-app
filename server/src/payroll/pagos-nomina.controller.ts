import { Controller, Get, Post, Body, Param, ParseIntPipe, Req } from '@nestjs/common';
import { PagosNominaService } from './pagos-nomina.service';
import { CreatePagoNominaDto } from './dto/create-pago-nomina.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';

// El cajero paga jornales del dia desde su caja, por eso entra junto al
// ADMIN. Quien registra queda en id_usuario_registra (del JWT, no del body).
@Roles('ADMIN', 'CAJERO')
@Controller('/payroll/empleados/:idEmpleado')
export class PagosNominaController {
  constructor(private readonly pagosNominaService: PagosNominaService) {}

  @Get('saldo')
  saldo(@Param('idEmpleado', ParseIntPipe) idEmpleado: number) {
    return this.pagosNominaService.saldo(idEmpleado);
  }

  @Post('pagos')
  registrar(
    @Param('idEmpleado', ParseIntPipe) idEmpleado: number,
    @Body() createPagoNominaDto: CreatePagoNominaDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.pagosNominaService.registrar(idEmpleado, req.user.id, createPagoNominaDto);
  }

  @Get('pagos')
  findByEmpleado(@Param('idEmpleado', ParseIntPipe) idEmpleado: number) {
    return this.pagosNominaService.findByEmpleado(idEmpleado);
  }
}
