import { Controller, Get, Req } from '@nestjs/common';
import { MiNominaService } from './mi-nomina.service';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { Area } from '../auth/decorators/area.decorator';

// Autoservicio del empleado: cualquier usuario autenticado consulta SU propia
// nomina (el empleado sale del JWT, no de un parametro). Sin @Roles a proposito
// -tambien el MESERO, que no entra a la gestion de nomina, ve lo suyo-. Es solo
// lectura: registrar marcaciones/pagos sigue siendo del cajero de turno.
// El prefijo /payroll/me es un literal disjunto de /payroll/empleados/:id.
@Controller('/payroll/me')
@Area('AMBAS')
export class MiNominaController {
  constructor(private readonly miNominaService: MiNominaService) {}

  @Get('resumen')
  resumen(@Req() req: AuthenticatedRequest) {
    return this.miNominaService.resumen(req.user.id);
  }
}
