import { Module } from '@nestjs/common';
import { TarifasController } from './tarifas.controller';
import { TarifasService } from './tarifas.service';
import { NominaConfigController } from './nomina-config.controller';
import { NominaConfigService } from './nomina-config.service';
import { JornadasController } from './jornadas.controller';
import { JornadasService } from './jornadas.service';
import { ConceptosController } from './conceptos.controller';
import { ConceptosService } from './conceptos.service';
import { ConceptosEmpleadoController } from './conceptos-empleado.controller';
import { ConceptosEmpleadoService } from './conceptos-empleado.service';
import { PagosNominaController } from './pagos-nomina.controller';
import { PagosNominaService } from './pagos-nomina.service';
import { SaldosNominaController } from './saldos-nomina.controller';
import { PropinasController } from './propinas.controller';
import { PropinasService } from './propinas.service';
import { PropinasConfigService } from './propinas-config.service';
import { MiNominaController } from './mi-nomina.controller';
import { MiNominaService } from './mi-nomina.service';

// Prefijos: /payroll/config|jornadas|conceptos son literales disjuntos y
// bajo /payroll/empleados/:idEmpleado cada controller usa su propio
// segmento literal (tarifas|conceptos|saldo|pagos) — sin colisiones
// literal-vs-:param entre controllers.
@Module({
  controllers: [
    TarifasController,
    NominaConfigController,
    JornadasController,
    ConceptosController,
    ConceptosEmpleadoController,
    PagosNominaController,
    SaldosNominaController,
    PropinasController,
    MiNominaController,
  ],
  providers: [
    TarifasService,
    NominaConfigService,
    JornadasService,
    ConceptosService,
    ConceptosEmpleadoService,
    PagosNominaService,
    PropinasService,
    PropinasConfigService,
    MiNominaService,
  ],
})
export class PayrollModule {}
