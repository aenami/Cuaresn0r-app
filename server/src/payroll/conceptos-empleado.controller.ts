import { Controller, Get, Post, Body, Param, ParseIntPipe } from '@nestjs/common';
import { ConceptosEmpleadoService } from './conceptos-empleado.service';
import { CreateConceptoEmpleadoDto } from './dto/create-concepto-empleado.dto';
import { Roles } from '../auth/decorators/roles.decorator';

// Otorgar bonos/deducciones toca directamente lo que se le debe a un
// empleado: solo ADMIN.
@Roles('ADMIN')
@Controller('/payroll/empleados/:idEmpleado/conceptos')
export class ConceptosEmpleadoController {
  constructor(private readonly conceptosEmpleadoService: ConceptosEmpleadoService) {}

  @Post()
  aplicar(@Param('idEmpleado', ParseIntPipe) idEmpleado: number, @Body() createConceptoEmpleadoDto: CreateConceptoEmpleadoDto) {
    return this.conceptosEmpleadoService.aplicar(idEmpleado, createConceptoEmpleadoDto);
  }

  @Get()
  findByEmpleado(@Param('idEmpleado', ParseIntPipe) idEmpleado: number) {
    return this.conceptosEmpleadoService.findByEmpleado(idEmpleado);
  }
}
