import { Module } from '@nestjs/common';
import { BillingConfigController } from './billing-config.controller';
import { BillingConfigService } from './billing-config.service';
import { NegocioConfigController } from './negocio-config.controller';
import { NegocioConfigService } from './negocio-config.service';
import { CajasController } from './cajas.controller';
import { CajasService } from './cajas.service';
import { TurnosController } from './turnos.controller';
import { TurnosService } from './turnos.service';
import { MovimientosCajaController } from './movimientos-caja.controller';
import { MovimientosCajaService } from './movimientos-caja.service';
import { FacturasController } from './facturas.controller';
import { FacturasService } from './facturas.service';
import { PagosController } from './pagos.controller';
import { PagosService } from './pagos.service';
import { ProveedoresController } from './proveedores.controller';
import { ProveedoresService } from './proveedores.service';
import { CuentasPorPagarController } from './cuentas-por-pagar.controller';
import { CuentasPorPagarService } from './cuentas-por-pagar.service';

// Prefijos de ruta disjuntos (/billing/config|cajas|turnos|movimientos|
// facturas), asi que el orden de registro no genera colisiones
// literal-vs-:param entre controllers (el bug que hubo en recipes).
@Module({
  controllers: [
    BillingConfigController,
    NegocioConfigController,
    CajasController,
    TurnosController,
    MovimientosCajaController,
    FacturasController,
    PagosController,
    ProveedoresController,
    CuentasPorPagarController,
  ],
  providers: [
    BillingConfigService,
    NegocioConfigService,
    CajasService,
    TurnosService,
    MovimientosCajaService,
    FacturasService,
    PagosService,
    ProveedoresService,
    CuentasPorPagarService,
  ],
})
export class BillingModule {}
