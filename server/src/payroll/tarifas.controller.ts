import { Controller, Get, Post, Body, Param, ParseIntPipe } from '@nestjs/common';
import { TarifasService } from './tarifas.service';
import { CreateTarifaDto } from './dto/create-tarifa.dto';
import { Roles } from '../auth/decorators/roles.decorator';

// Cuanto gana cada empleado es dato sensible: solo ADMIN.
@Roles('ADMIN')
@Controller('/payroll/empleados/:idEmpleado/tarifas')
export class TarifasController {
  constructor(private readonly tarifasService: TarifasService) {}

  @Get()
  findByEmpleado(@Param('idEmpleado', ParseIntPipe) idEmpleado: number) {
    return this.tarifasService.findByEmpleado(idEmpleado);
  }

  @Post()
  crearVersion(@Param('idEmpleado', ParseIntPipe) idEmpleado: number, @Body() createTarifaDto: CreateTarifaDto) {
    return this.tarifasService.crearVersion(idEmpleado, createTarifaDto);
  }
}
