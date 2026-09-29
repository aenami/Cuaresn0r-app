import { Controller, Get, Query, Req } from '@nestjs/common';
import { Area } from '../auth/decorators/area.decorator';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { ReportsService } from './reports.service';
import { Roles } from '../auth/decorators/roles.decorator';

// Toda la analitica es solo para el ADMIN.
@Roles('ADMIN')
@Area('AMBAS')
@Controller('/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // Un unico endpoint con todo el dashboard, para un solo request desde el front.
  // desde/hasta: ISO datetime local (el front arma los limites del rango).
  @Get('resumen')
  resumen(@Req() req: AuthenticatedRequest, @Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    return this.reportsService.resumen(desde, hasta, req.areaSeleccionada ?? req.user.area);
  }
}
