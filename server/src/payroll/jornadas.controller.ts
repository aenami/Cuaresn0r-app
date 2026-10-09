import { Controller, Get, Post, Body, Param, Patch, Delete, ParseIntPipe, Query } from '@nestjs/common';
import { JornadasService } from './jornadas.service';
import { MarcarDto } from './dto/marcar.dto';
import { RegistrarHorarioDto } from './dto/registrar-horario.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Area } from '../auth/decorators/area.decorator';
import { EstadoJornada } from '../generated/prisma/client';

// El cajero de turno es quien registra entradas/salidas del personal
// (seccion 11: la trazabilidad de quien marco queda implicita en el turno).
@Roles('ADMIN')
@Controller('/payroll/jornadas')
@Area('AMBAS')
export class JornadasController {
  constructor(private readonly jornadasService: JornadasService) {}

  @Post('horario')
  registrarHorario(@Body() dto: RegistrarHorarioDto) {
    return this.jornadasService.registrarHorario(dto);
  }

  @Post('marcar')
  marcar(@Body() marcarDto: MarcarDto) {
    return this.jornadasService.marcar(marcarDto);
  }

  @Get()
  findAll(@Query('empleado') empleado?: string, @Query('estado') estado?: EstadoJornada, @Query('fecha') fecha?: string) {
    return this.jornadasService.findAll(empleado !== undefined ? Number(empleado) : undefined, estado, fecha);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.jornadasService.findOne(id);
  }

  @Patch(':id/cerrar')
  cerrar(@Param('id', ParseIntPipe) id: number) {
    return this.jornadasService.cerrar(id);
  }

  // "Ctrl+Z" de una marcacion equivocada (solo jornadas abiertas).
  @Delete(':id/marcaciones/ultima')
  deshacerUltimaMarcacion(@Param('id', ParseIntPipe) id: number) {
    return this.jornadasService.deshacerUltimaMarcacion(id);
  }

  // Reabrir borra los devengos del cierre (si nada esta pagado): accion
  // sensible que queda restringida a ADMIN.
  @Roles('ADMIN')
  @Patch(':id/reabrir')
  reabrir(@Param('id', ParseIntPipe) id: number) {
    return this.jornadasService.reabrir(id);
  }
}
