// Tipos espejo de las respuestas del backend (entidades Prisma serializadas):
// Decimal llega como string, DateTime como ISO string.

// ---- catalogo ----

// Donde se prepara (categorias y tickets): siempre un lugar concreto.
export type DestinoPreparacion = 'COCINA' | 'BARRA'
// Las impresoras ademas aceptan GENERAL: una sola termica recibe todo.
export type DestinoImpresion = DestinoPreparacion | 'GENERAL'

export interface Categoria {
  id_categoria: number
  nombre_categoria: string
  descripcion_categoria: string | null
  destino_categoria: DestinoPreparacion
  // Categoria de adiciones: sus productos no se piden sueltos en el menu; solo
  // aparecen como adiciones (con precio) al personalizar un item.
  es_adicion: boolean
}

export interface Producto {
  id_producto: number
  nombre_producto: string
  precio_producto: string
  descripcion_producto: string | null
  categoria_producto: number | null
  habilitado_producto: boolean
  imagen_producto: string | null
  categoria?: Categoria | null
}

export interface DetalleCombo {
  id_detalleCombo: number
  id_combo_detalleCombo: number
  id_producto_detalleCombo: number
  cantidad_detalleCombo: string
  producto?: Producto
}

export interface Combo {
  id_combo: number
  nombre_combo: string
  precio_combo: string
  combo_activo: boolean
  detallesCombo?: DetalleCombo[]
}

// ---- recetas e inventario ----

export type UnidadIngrediente = 'kg' | 'g' | 'dg' | 'mg' | 'ml' | 'L' | 'UNIDADES'

export interface Ingrediente {
  id_ingrediente: number
  nombre_ingrediente: string
  stock_ingrediente: string
  unidades_ingrediente: UnidadIngrediente
  precio_ingrediente: string
}

export interface DetalleReceta {
  id_detalleReceta: number
  id_receta_detalleReceta: number
  id_ingrediente_detalleReceta: number
  cantidad_ingrediente_detalleReceta: string
  ingrediente?: Ingrediente
}

export interface Receta {
  id_receta: number
  id_producto_receta: number
  nombre_receta: string
  receta_activa: boolean
  fecha_creacion_receta: string
  detalles?: DetalleReceta[]
  producto?: Producto
}

export type TipoMovimientoInventario =
  | 'ENTRADA'
  | 'SALIDA_RECETA'
  | 'MERMA'
  | 'AJUSTE_POSITIVO'
  | 'AJUSTE_NEGATIVO'
  | 'REVERSO'

export interface MovimientoInventario {
  id_movimiento: number
  id_ingrediente_movimiento: number
  tipo_movimiento: TipoMovimientoInventario
  cantidad_movimiento: string
  fecha_movimiento: string
  motivo_movimiento?: string | null
}

// ---- salon ----

export type EstadoMesa = 'LIBRE' | 'RESERVADA' | 'OCUPADA' | 'DESACTIVADA'

export interface Zona {
  id_zona: number
  nombre_zona: string
  identificador_zona: string
}

export interface Mesa {
  id_mesa: number
  numero_mesa: number
  capacidad_mesa: number | null
  id_zona_mesa: number
  estado_mesa: EstadoMesa
  zona?: Zona
}

// ---- pedidos y comandas ----

export type EstadoPedido = 'EN_PREPARACION' | 'ENTREGADO' | 'PAGADO' | 'CANCELADO'
export type EstadoDetalleComanda = 'PREPARANDO' | 'ENTREGADO' | 'CANCELADO'
// MESA: pedido de salon (ocupa una mesa). DOMICILIO: entrega a domicilio (sin mesa).
export type TipoPedido = 'MESA' | 'DOMICILIO'

export interface DetalleComandaIngrediente {
  id_detalleComandaIngrediente: number
  id_detalleComanda_dci: number
  id_ingrediente_dci: number
  cantidad_delta: string
  ingrediente?: Ingrediente
}

// Tabla puente del reparto proporcional de un item compartido. Un item usa
// asignacion directa (id_subcuenta_dc) O reparto, nunca ambos.
export interface SubcuentaDetalleComanda {
  id_subcuentaDetalleComanda: number
  id_detalleComanda_sdc: number
  id_subcuenta_sdc: number
  proporcion_sdc: string
}

export interface DetalleComanda {
  id_detalleComanda: number
  id_comanda_dc: number
  id_detalleComandaPadre_dc: number | null
  id_producto_dc: number | null
  id_combo_dc: number | null
  id_receta_usada_dc: number | null
  id_subcuenta_dc: number | null
  estado_dc: EstadoDetalleComanda
  cantidad_producto_dc: number
  precio_unitario_dc: string
  indicaciones_dc: string | null
  producto?: Producto | null
  combo?: Combo | null
  ingredientesPersonalizados?: DetalleComandaIngrediente[]
  hijos?: DetalleComanda[]
  subcuentasReparto?: SubcuentaDetalleComanda[]
}

export type EstadoImpresion = 'PENDIENTE' | 'IMPRESA' | 'FALLIDA'

export interface Impresora {
  id_impresora: number
  nombre_impresora: string
  destino_impresora: DestinoImpresion
  host_impresora: string
  puerto_impresora: number
  ancho_papel_impresora: number
  impresora_activa: boolean
}

export interface ImpresionComanda {
  id_impresionComanda: number
  id_comanda_impresion: number
  destino_impresion: DestinoPreparacion
  estado_impresion: EstadoImpresion
  intentos_impresion: number
  motivo_fallo: string | null
  fecha_actualizacion: string
}

export interface Comanda {
  id_comanda: number
  id_pedido_comanda: number
  creacion_comanda: string
  detalles?: DetalleComanda[]
  impresiones?: ImpresionComanda[]
}

export interface Subcuenta {
  id_subcuenta: number
  id_pedido_subcuenta: number
  nombre_subcuenta: string | null
  fecha_creacion_subcuenta: string
}

export interface Pedido {
  id_pedido: number
  fecha_pedido: string
  estado_pedido: EstadoPedido
  tipo_pedido: TipoPedido
  // null en domicilios (no ocupan mesa).
  mesa_pedido: number | null
  mesero_pedido: number
  // Solo presentes en domicilios.
  nombre_cliente_pedido: string | null
  telefono_cliente_pedido: string | null
  direccion_cliente_pedido: string | null
  mesa?: Mesa | null
  mesero?: { id_usuario: number; email_usuario: string }
  subcuentas?: Subcuenta[]
  comandas?: Comanda[]
}

// ---- billing (facturacion, caja, turnos) ----

export type MetodoPago = 'TARJETA' | 'TRANSFERENCIA' | 'EFECTIVO'
export type DestinoExcedente = 'CASA' | 'PROPINA'
export type EstadoFactura = 'EMITIDA' | 'PAGADA' | 'ANULADA'
export type EstadoTurno = 'ABIERTO' | 'CERRADO'
export type TipoMovimientoCaja = 'INGRESO' | 'EGRESO'

export interface ConfiguracionFacturacion {
  id_configuracionFacturacion: number
  porcentaje_servicio: string
  porcentaje_impuestos: string
  configuracion_activa: boolean
  fecha_creacion_configuracionFacturacion: string
}

// Datos del negocio para el encabezado de la factura (GET /billing/negocio).
export interface ConfiguracionNegocio {
  id_configuracionNegocio: number
  nombre_negocio: string
  nit_negocio: string | null
  direccion_negocio: string | null
  telefono_negocio: string | null
  configuracion_activa: boolean
  fecha_creacion_configuracionNegocio: string
}

export interface Caja {
  id_caja: number
  nombre_caja: string
  // El backend incluye solo los turnos ABIERTOS de la caja.
  turnos?: Turno[]
}

export interface Pago {
  id_pago: number
  id_factura_pago: number
  id_turno_pago: number
  subtotal_pago: string
  monto_servicio_pago: string
  monto_impuestos_pago: string
  monto_total_pago: string
  // Excedente voluntario ("quedese con el vuelto"): 0 = sin excedente.
  monto_excedente_pago: string
  destino_excedente_pago: DestinoExcedente | null
  metodo_pago: MetodoPago
  fecha_pago: string
}

// El "servicio" es la propina (ver dominio): monto_servicio_factura es el
// monto de propina snapshoteado al emitir.
export interface Factura {
  id_factura: number
  id_subcuenta_factura: number
  fecha_emision_factura: string
  subtotal_factura: string
  monto_servicio_factura: string
  monto_impuestos_factura: string
  monto_total_factura: string
  estado_factura: EstadoFactura
  motivo_anulacion_factura: string | null
  pagos?: Pago[]
  subcuenta?: Subcuenta & {
    pedido?: { id_pedido: number; estado_pedido: EstadoPedido; mesa_pedido: number | null }
  }
}

export interface MovimientoCaja {
  id_mc: number
  id_turno_mc: number
  tipo_mc: TipoMovimientoCaja
  monto_mc: string
  concepto_mc: string
  fecha_mc: string
}

export interface Turno {
  id_turno: number
  id_caja_turno: number
  id_usuario_turno: number
  fecha_apertura_turno: string
  fecha_cierre_turno: string | null
  monto_apertura_turno: string
  monto_cierre_esperado: string | null
  monto_cierre_real_turno: string | null
  // Desglose por denominacion del conteo de cierre: { "100000": 2, ... }.
  conteo_cierre_turno?: Record<string, number> | null
  estado_turno: EstadoTurno
  caja?: Caja
  usuario?: { id_usuario: number; email_usuario: string }
}

export interface PagoPorMetodo {
  metodo: MetodoPago
  cantidad: number
  total: string | null
}

// Un pago individual del turno para el registro de movimientos (ledger).
export interface PagoLedger {
  id_pago: number
  metodo: MetodoPago
  monto: string
  fecha: string
  id_pedido: number
}

// GET /billing/turnos/:id y /actual: turno + movimientos + totales por metodo
// + pagos individuales (para el cuadre, la conciliacion del datafono y el ledger).
export interface TurnoResumen extends Turno {
  movimientosCaja: MovimientoCaja[]
  pagosPorMetodo: PagoPorMetodo[]
  pagos: PagoLedger[]
}

// ---- reporte de cuentas cobradas (GET /billing/facturas/pagadas) ----

// Un item consumido de la cuenta; los hijos son componentes de combo (precio 0)
// y adiciones (precio > 0).
export interface ItemCuentaPagada {
  id: number
  nombre: string
  cantidad: number
  precio_unitario: string
  hijos: { id: number; nombre: string; cantidad: number; precio_unitario: string }[]
}

export interface PagoCuenta {
  metodo: MetodoPago
  monto: string
  fecha: string
  // Excedente voluntario ("quedese con el vuelto"): 0 = sin excedente.
  excedente: string
  destino: DestinoExcedente | null
}

// Shape aplanado por el backend: factura PAGADA con su detalle para el reporte.
export interface CuentaPagada {
  id_factura: number
  fecha: string
  subtotal: string
  servicio: string
  impuestos: string
  total: string
  nombre_cuenta: string | null
  cajero: string | null
  pedido: {
    id_pedido: number
    tipo: TipoPedido
    mesa_numero: number | null
    zona: string | null
    mesero: string | null
    // Solo en domicilios.
    cliente: { nombre: string | null; telefono: string | null; direccion: string | null } | null
  }
  pagos: PagoCuenta[]
  items: ItemCuentaPagada[]
}

// ---- nomina (empleados, jornadas, tarifas, conceptos, devengos, pagos) ----

export type EstadoEmpleado = 'ACTIVO' | 'INACTIVO'
export type TipoMarcacion = 'ENTRADA' | 'SALIDA'
export type EstadoJornada = 'ABIERTA' | 'CERRADA'
export type TipoConceptoNomina = 'INGRESO' | 'DEDUCCION'
export type UnidadCalculoConceptoNomina = 'DIA_TRABAJADO'
export type MetodoPagoNomina = 'EFECTIVO' | 'TRANSFERENCIA'

export interface Empleado {
  id_empleado: number
  nombre_empleado: string
  apellido_empleado: string
  fecha_ingreso_empleado: string
  fecha_retiro_empleado: string | null
  estado_empleado: EstadoEmpleado
}

export interface Marcacion {
  id_marcacion: number
  id_jornada_marcacion: number
  tipo_marcacion: TipoMarcacion
  fecha_hora_marcacion: string
}

// El horas devengo (por jornada) trae horas/tarifa; los de concepto van en 0.
export interface DevengoNomina {
  id_devengoNomina: number
  id_empleado_devengoNomina: number
  id_jornada_devengoNomina: number | null
  id_conceptoNominaEmpleado_devengoNomina: number | null
  horas_ordinarias_devengoNomina: string | null
  horas_recargo_devengoNomina: string | null
  valor_hora_aplicado_devengoNomina: string | null
  porcentaje_recargo_aplicado_devengoNomina: string | null
  monto_devengoNomina: string
  fecha_devengoNomina: string
}

export interface Jornada {
  id_jornada: number
  id_empleado_jornada: number
  fecha_jornada: string
  estado_jornada: EstadoJornada
  empleado?: { id_empleado: number; nombre_empleado: string; apellido_empleado: string }
  marcaciones?: Marcacion[]
  devengos?: DevengoNomina[]
}

export interface TarifaEmpleado {
  id_tarifaEmpleado: number
  id_empleado_tarifaEmpleado: number
  valor_hora_tarifaEmpleado: string
  tarifa_activa: boolean
  fecha_inicio_tarifaEmpleado: string
}

export interface ValorConceptoNomina {
  id_valorConceptoNomina: number
  id_concepto_valorConceptoNomina: number
  monto_valorConceptoNomina: string
  valor_activo: boolean
  fecha_inicio_valorConceptoNomina: string
}

export interface ConceptoNomina {
  id_conceptoNomina: number
  nombre_conceptoNomina: string
  tipo_conceptoNomina: TipoConceptoNomina
  aplica_automaticamente: boolean
  unidad_calculo_conceptoNomina: UnidadCalculoConceptoNomina | null
  // El backend incluye solo el valor activo (arreglo de 0 o 1).
  valores?: ValorConceptoNomina[]
}

export interface ConceptoNominaEmpleado {
  id_conceptoNominaEmpleado: number
  id_concepto_cne: number
  id_empleado_cne: number
  id_jornada_cne: number | null
  fecha_cne: string
  cantidad_cne: string | null
  valor_unitario_aplicado_cne: string
  monto_cne: string
  observacion_cne: string | null
  concepto?: ConceptoNomina
}

// Devengo con estado de pago calculado al vuelo (endpoint saldo).
export interface DevengoConSaldo extends DevengoNomina {
  pagado: string
  restante: string
  estadoPago: 'PENDIENTE' | 'PARCIAL' | 'PAGADO'
}

export interface SaldoEmpleado {
  empleado: {
    id_empleado: number
    nombre_empleado: string
    apellido_empleado: string
    estado_empleado: EstadoEmpleado
  }
  totalDevengado: string
  totalPagado: string
  saldoPendiente: string
  devengos: DevengoConSaldo[]
}

// GET /payroll/empleados/saldos: saldo pendiente de todos, para el directorio.
export interface SaldoResumen {
  id_empleado: number
  saldoPendiente: string
}

export interface PagoNominaDetalle {
  id_pagoNominaDetalle: number
  id_pagoNomina_pnd: number
  id_devengoNomina_pnd: number
  monto_aplicado_pnd: string
  devengoNomina?: DevengoNomina
}

export interface PagoNomina {
  id_pagoNomina: number
  id_empleado_pagoNomina: number
  id_turno_pagoNomina: number | null
  monto_pagoNomina: string
  fecha_pagoNomina: string
  metodo_pagoNomina: MetodoPagoNomina
  observacion_pagoNomina: string | null
  detalles?: PagoNominaDetalle[]
  usuarioRegistra?: { id_usuario: number; email_usuario: string }
}

// GET /payroll/me/resumen: autoservicio de solo lectura. El empleado sale del
// JWT (no de un parametro); compone su saldo, jornadas, pagos y tarifa vigente.
export interface MiNominaResumen {
  empleado: Empleado
  saldo: {
    totalDevengado: string
    totalPagado: string
    saldoPendiente: string
    devengos: DevengoConSaldo[]
  }
  jornadas: Jornada[]
  pagos: PagoNomina[]
  tarifaActiva: TarifaEmpleado | null
  // Porcentaje del recargo nocturno global (para mostrar el valor/hora nocturno).
  recargoNocturno: { porcentaje: string } | null
}

export interface ConfiguracionNomina {
  id_configuracionNomina?: number
  aplica_recargo_nocturno: boolean
  porcentaje_recargo_nocturno: string | null
  // Columna @db.Time serializada como ISO (1970-01-01T22:00:00.000Z); se lee
  // en UTC para mostrar "22:00".
  hora_inicio_nocturno: string | null
  hora_fin_nocturno: string | null
  configuracion_activa?: boolean
  fecha_creacion_configuracionNomina?: string
}

// ---- reparto de propinas (montos como number: valores de visualizacion) ----

export type MetodoReparto = 'IGUALES' | 'PRESENCIA'

export interface PropinaAsignacion {
  idEmpleado: number
  nombre: string
  monto: number
}

export interface PropinasPreview {
  fecha: string
  metodo: MetodoReparto
  pool: number
  // Retencion del restaurante (config activa): % que se queda el local,
  // el monto retenido y lo que queda repartible entre los empleados.
  porcentajeCasa: number
  retencionCasa: number
  repartible: number
  cuentasConPropina: number
  trabajaron: number
  // El reparto solo se habilita cuando el dia ya termino (no a mitad de dia).
  diaFinalizado: boolean
  asignaciones: PropinaAsignacion[]
  sinAsignar: number
  repartoExistente: null | {
    total: number
    empleados: number
    pagado: boolean
    detalle: PropinaAsignacion[]
  }
}

// GET /payroll/propinas/config: retencion del restaurante sobre las propinas.
// Versionada; findActiva puede devolver el default (sin id/activa/fecha).
export interface ConfiguracionPropinas {
  id_configuracionPropinas?: number
  retiene_casa: boolean
  porcentaje_casa: string | null
  configuracion_activa?: boolean
  fecha_creacion_configuracionPropinas?: string
}

// ---- auth (usuarios del sistema, roles) ----

export interface Rol {
  id_rol: number
  nombre_rol: string
}

// Espejo del SAFE_SELECT del backend: nunca incluye password_usuario.
export interface Usuario {
  id_usuario: number
  email_usuario: string
  fecha_creacion_usuario: string
  empleado: {
    id_empleado: number
    nombre_empleado: string
    apellido_empleado: string
    estado_empleado: EstadoEmpleado
  }
  rol: {
    id_rol: number
    nombre_rol: string
  }
}

// ---- reportes / analitica (solo ADMIN) ----
// Los montos vienen como number (no string): son valores de visualizacion
// redondeados a 2 decimales que alimentan las graficas.

// null cuando el periodo anterior fue 0 (no hay base de comparacion).
type Delta = number | null

export interface ReporteResumen {
  rango: { desde: string; hasta: string }
  ventas: {
    netas: number
    propina: number
    cuentas: number
    items: number
    domicilios: number
    ticketPromedio: number
    delta: {
      netas: Delta
      propina: Delta
      cuentas: Delta
      items: Delta
      domicilios: Delta
      ticketPromedio: Delta
    }
  }
  porDia: { fecha: string; total: number; cuentas: number; domicilios: number }[]
  porHora: { hora: number; total: number; cuentas: number }[]
  metodosPago: { metodo: MetodoPago; monto: number; cuenta: number }[]
  topProductos: { nombre: string; unidades: number; ingresos: number }[]
  porCategoria: { categoria: string; unidades: number; ingresos: number }[]
  porMesero: { mesero: string; ventas: number; pedidos: number; ticketPromedio: number }[]
  porZona: { zona: string; ventas: number; cuentas: number }[]
  ocupacionMesas: { LIBRE: number; OCUPADA: number; RESERVADA: number; DESACTIVADA: number }
}
