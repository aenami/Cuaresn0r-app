import { Controller, Get, Post, Body, Patch, Param, Query, ParseIntPipe } from '@nestjs/common';
import { EmpleadosService } from './empleados.service';
import { CreateEmpleadoDto } from './dto/create-empleado.dto';
import { UpdateEmpleadoDto } from './dto/update-empleado.dto';
import { Roles } from '../decorators/roles.decorator';
import { EstadoEmpleado } from '../../generated/prisma/client';

// La gestion de empleados (altas, bajas) queda restringida a ADMIN.
@Roles('ADMIN')
@Controller('/auth/empleados')
export class EmpleadosController {
  constructor(private readonly empleadosService: EmpleadosService) {}

  @Post()
  create(@Body() createEmpleadoDto: CreateEmpleadoDto) {
    return this.empleadosService.create(createEmpleadoDto);
  }

  // Consultar el directorio/perfil lo necesita tambien el CAJERO (marca
  // asistencia y paga jornales); crear/editar/retirar siguen siendo ADMIN.
  @Roles('ADMIN', 'CAJERO')
  @Get()
  findAll(@Query('estado') estado?: EstadoEmpleado) {
    return this.empleadosService.findAll(estado);
  }

  @Roles('ADMIN', 'CAJERO')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.empleadosService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() updateEmpleadoDto: UpdateEmpleadoDto) {
    return this.empleadosService.update(id, updateEmpleadoDto);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id', ParseIntPipe) id: number) {
    return this.empleadosService.deactivate(id);
  }

  @Patch(':id/reactivate')
  reactivate(@Param('id', ParseIntPipe) id: number) {
    return this.empleadosService.reactivate(id);
  }
}
