import { Controller, Get, Post, Body, Param, Patch, ParseIntPipe, Query, Req } from '@nestjs/common';
import { TurnosService } from './turnos.service';
import { AbrirTurnoDto } from './dto/abrir-turno.dto';
import { CerrarTurnoDto } from './dto/cerrar-turno.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Area } from '../auth/decorators/area.decorator';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { AreaNegocio, EstadoTurno } from '../generated/prisma/client';

@Roles('ADMIN', 'CAJERO')
@Area('AMBAS')
@Controller('/billing/turnos')
export class TurnosController {
  constructor(private readonly turnosService: TurnosService) {}

  // El turno queda a nombre del usuario autenticado, nunca de un tercero.
  @Post()
  abrir(@Body() abrirTurnoDto: AbrirTurnoDto, @Req() req: AuthenticatedRequest) {
    return this.turnosService.abrir(req.user.id, abrirTurnoDto, req.user.area, req.user.rolNombre);
  }

  @Get()
  findAll(@Req() req: AuthenticatedRequest, @Query('estado') estado?: EstadoTurno, @Query('area') area?: AreaNegocio) {
    return this.turnosService.findAll(estado, area ?? req.user.area, req.user.area, req.user.rolNombre);
  }

  // OJO: declarado antes de ':id' — Express matchea en orden de registro y
  // ':id' capturaria "actual" (mismo bug que hubo en /recipes/ingredients).
  @Get('actual')
  findActual(@Req() req: AuthenticatedRequest, @Query('area') area?: AreaNegocio) {
    return this.turnosService.findActual(req.user.id, area ?? req.user.area, req.user.area, req.user.rolNombre);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest) {
    return this.turnosService.findOne(id, req.user.area, req.user.rolNombre);
  }

  @Patch(':id/cerrar')
  cerrar(
    @Param('id', ParseIntPipe) id: number,
    @Body() cerrarTurnoDto: CerrarTurnoDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.turnosService.cerrar(id, req.user.id, req.user.rolNombre, cerrarTurnoDto, req.user.area);
  }

  @Get(':id/conteo-inventario')
  estadoInventario(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest) {
    return this.turnosService.estadoInventario(id, req.user.area, req.user.rolNombre);
  }
}
