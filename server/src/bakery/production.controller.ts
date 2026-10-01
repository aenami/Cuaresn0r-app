import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { Area } from '../auth/decorators/area.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { ActualizarMetaPanaderiaDto, CrearMetaPanaderiaDto, RegistrarEntradaHojaDto } from './production.dto';
import { ProductionGoalsBakeryService, ProductionSheetsService } from './production.service';

@Area('PANADERIA')
@Roles('PANADERO', 'ADMIN_LOCAL', 'ADMIN_GLOBAL', 'ADMIN')
@Controller('/bakery/production-sheets')
export class ProductionSheetsController {
  constructor(private readonly sheets: ProductionSheetsService) {}

  @Get()
  listar(@Req() req: AuthenticatedRequest, @Query('date') fecha?: string) {
    return this.sheets.listar(fecha, req.user.id, req.user.rolNombre);
  }

  @Get(':id')
  obtener(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.sheets.obtener(id, req.user.id, req.user.rolNombre);
  }

  @Roles('PANADERO')
  @Post('entries')
  agregar(@Req() req: AuthenticatedRequest, @Body() dto: RegistrarEntradaHojaDto) {
    return this.sheets.agregar(req.user.id, req.user.rolNombre, dto);
  }

  @Roles('PANADERO')
  @Post(':id/finalize')
  finalizar(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.sheets.finalizar(id, req.user.id, req.user.rolNombre);
  }
}

@Area('PANADERIA')
@Roles('PANADERO', 'ADMIN_LOCAL', 'ADMIN_GLOBAL', 'ADMIN')
@Controller('/bakery/production-goals')
export class ProductionGoalsBakeryController {
  constructor(private readonly goals: ProductionGoalsBakeryService) {}

  @Get()
  listar(@Query('date') fecha?: string) {
    return this.goals.listar(fecha);
  }

  @Roles('ADMIN_LOCAL', 'ADMIN_GLOBAL', 'ADMIN')
  @Post()
  crear(@Body() dto: CrearMetaPanaderiaDto, @Req() req: AuthenticatedRequest) {
    return this.goals.crear(dto, req.user.id);
  }

  @Roles('PANADERO', 'ADMIN_LOCAL', 'ADMIN_GLOBAL', 'ADMIN')
  @Patch(':id/status')
  actualizarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarMetaPanaderiaDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.goals.actualizarEstado(id, dto.estado, req.user.id, req.user.rolNombre !== 'PANADERO');
  }

  @Roles('ADMIN_LOCAL', 'ADMIN_GLOBAL', 'ADMIN')
  @Delete(':id')
  eliminar(@Param('id', ParseIntPipe) id: number) {
    return this.goals.eliminar(id);
  }
}
