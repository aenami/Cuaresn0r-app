import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { JornadasService } from './jornadas.service';
import { RegistrarHorarioDto } from './dto/registrar-horario.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Area } from '../auth/decorators/area.decorator';
import { EstadoJornada } from '../generated/prisma/client';

// La asistencia se confirma con horarios completos, incluidos turnos partidos.
@Roles('ADMIN')
@Controller('/payroll/jornadas')
@Area('AMBAS')
export class JornadasController {
  constructor(private readonly jornadasService: JornadasService) {}

  @Post('horario')
  registrarHorario(@Body() dto: RegistrarHorarioDto) {
    return this.jornadasService.registrarHorario(dto);
  }

  @Get()
  findAll(
    @Query('empleado') empleado?: string,
    @Query('estado') estado?: EstadoJornada,
    @Query('fecha') fecha?: string,
  ) {
    return this.jornadasService.findAll(
      empleado !== undefined ? Number(empleado) : undefined,
      estado,
      fecha,
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.jornadasService.findOne(id);
  }
}
