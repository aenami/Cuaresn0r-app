import { Controller, Get, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { Roles } from '../auth/decorators/roles.decorator';

// Toda la analitica es solo para el ADMIN.
@Roles('ADMIN')
@Controller('/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // Un unico endpoint con todo el dashboard, para un solo request desde el front.
  // desde/hasta: ISO datetime local (el front arma los limites del rango).
  @Get('resumen')
  resumen(@Query('desde') desde?: string, @Query('hasta') hasta?: string, @Query('area') area?: string) {
    return this.reportsService.resumen(desde, hasta, area);
  }
}
