import { Controller, Get, Post, Body, Param, Patch, ParseIntPipe, Query, Req } from '@nestjs/common';
import { TurnosService } from './turnos.service';
import { AbrirTurnoDto } from './dto/abrir-turno.dto';
import { CerrarTurnoDto } from './dto/cerrar-turno.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { EstadoTurno } from '../generated/prisma/client';

@Roles('ADMIN', 'CAJERO')
@Controller('/billing/turnos')
export class TurnosController {
  constructor(private readonly turnosService: TurnosService) {}

  // El turno queda a nombre del usuario autenticado, nunca de un tercero.
  @Post()
  abrir(@Body() abrirTurnoDto: AbrirTurnoDto, @Req() req: AuthenticatedRequest) {
    return this.turnosService.abrir(req.user.id, abrirTurnoDto);
  }

  @Get()
  findAll(@Query('estado') estado?: EstadoTurno) {
    return this.turnosService.findAll(estado);
  }

  // OJO: declarado antes de ':id' — Express matchea en orden de registro y
  // ':id' capturaria "actual" (mismo bug que hubo en /recipes/ingredients).
  @Get('actual')
  findActual(@Req() req: AuthenticatedRequest) {
    return this.turnosService.findActual(req.user.id);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.turnosService.findOne(id);
  }

  @Patch(':id/cerrar')
  cerrar(
    @Param('id', ParseIntPipe) id: number,
    @Body() cerrarTurnoDto: CerrarTurnoDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.turnosService.cerrar(id, req.user.id, req.user.rolNombre, cerrarTurnoDto);
  }

  @Get(':id/conteo-inventario')
  estadoInventario(@Param('id', ParseIntPipe) id: number) {
    return this.turnosService.estadoInventario(id);
  }
}
