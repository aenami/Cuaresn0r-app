import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { CreateProductionPlanDto } from './dto/create-production-plan.dto';
import { UpdateProductionPlanStatusDto } from './dto/update-production-plan-status.dto';
import { ProductionPlansService } from './production-plans.service';

@Controller('/recipes/production-plans')
export class ProductionPlansController {
  constructor(private readonly productionPlans: ProductionPlansService) {}

  @Get()
  findAll(@Query('date') fecha?: string) {
    return this.productionPlans.findAll(fecha);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateProductionPlanDto, @Req() req: AuthenticatedRequest) {
    return this.productionPlans.create(dto, req.user.id);
  }

  @Patch(':id/status')
  actualizarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductionPlanStatusDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.productionPlans.actualizarEstado(id, dto.estado, req.user.id, req.user.rolNombre === 'ADMIN');
  }

  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.productionPlans.remove(id);
  }
}
