import { Controller, Get } from '@nestjs/common';
import { PagosNominaService } from './pagos-nomina.service';
import { Roles } from '../auth/decorators/roles.decorator';

// Saldo de todos los empleados para el directorio. Ruta estatica
// (/payroll/empleados/saldos) — no colisiona con el :idEmpleado del resto.
@Roles('ADMIN', 'CAJERO')
@Controller('/payroll/empleados')
export class SaldosNominaController {
  constructor(private readonly pagosNominaService: PagosNominaService) {}

  @Get('saldos')
  saldos() {
    return this.pagosNominaService.saldosTodos();
  }
}
