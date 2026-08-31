-- CreateEnum
CREATE TYPE "EstadoMesa" AS ENUM ('LIBRE', 'RESERVADA', 'OCUPADA');

-- CreateEnum
CREATE TYPE "EstadoPedido" AS ENUM ('EN_PREPARACION', 'ENTREGADO', 'PAGADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "EstadoDetalleComanda" AS ENUM ('PREPARANDO', 'ENTREGADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "EstadoFactura" AS ENUM ('EMITIDA', 'ANULADA');

-- CreateEnum
CREATE TYPE "MetodoPago" AS ENUM ('TARJETA', 'TRANSFERENCIA', 'EFECTIVO');

-- CreateEnum
CREATE TYPE "EstadoTurno" AS ENUM ('ABIERTO', 'CERRADO');

-- CreateEnum
CREATE TYPE "TipoMovimientoCaja" AS ENUM ('INGRESO', 'EGRESO');

-- CreateEnum
CREATE TYPE "UnidadIngrediente" AS ENUM ('kg', 'g', 'dg', 'mg', 'ml', 'L', 'UNIDADES');

-- CreateEnum
CREATE TYPE "TipoMovimientoInventario" AS ENUM ('ENTRADA', 'SALIDA_RECETA', 'MERMA', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO', 'REVERSO');

-- CreateEnum
CREATE TYPE "EstadoEmpleado" AS ENUM ('ACTIVO', 'INACTIVO');

-- CreateEnum
CREATE TYPE "EstadoJornada" AS ENUM ('ABIERTA', 'CERRADA');

-- CreateEnum
CREATE TYPE "TipoMarcacion" AS ENUM ('ENTRADA', 'SALIDA');

-- CreateEnum
CREATE TYPE "TipoConceptoNomina" AS ENUM ('INGRESO', 'DEDUCCION');

-- CreateEnum
CREATE TYPE "UnidadCalculoConceptoNomina" AS ENUM ('DIA_TRABAJADO');

-- CreateEnum
CREATE TYPE "MetodoPagoNomina" AS ENUM ('EFECTIVO', 'TRANSFERENCIA');

-- CreateTable
CREATE TABLE "Rol" (
    "id_rol" SERIAL NOT NULL,
    "nombre_rol" VARCHAR(20) NOT NULL,

    CONSTRAINT "Rol_pkey" PRIMARY KEY ("id_rol")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id_usuario" SERIAL NOT NULL,
    "id_empleado_usuario" INTEGER NOT NULL,
    "id_rol" INTEGER,
    "email_usuario" VARCHAR(100),
    "fecha_creacion_usuario" DATE DEFAULT CURRENT_TIMESTAMP,
    "password_usuario" VARCHAR(100) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id_usuario")
);

-- CreateTable
CREATE TABLE "Zona" (
    "id_zona" SERIAL NOT NULL,
    "nombre_zona" VARCHAR(20) NOT NULL,
    "identificador_zona" VARCHAR(3) NOT NULL,

    CONSTRAINT "Zona_pkey" PRIMARY KEY ("id_zona")
);

-- CreateTable
CREATE TABLE "Mesa" (
    "id_mesa" SERIAL NOT NULL,
    "capacidad_mesa" INTEGER,
    "id_zona_mesa" INTEGER,
    "estado_mesa" "EstadoMesa" DEFAULT 'LIBRE',

    CONSTRAINT "Mesa_pkey" PRIMARY KEY ("id_mesa")
);

-- CreateTable
CREATE TABLE "Pedido" (
    "id_pedido" SERIAL NOT NULL,
    "fecha_pedido" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "estado_pedido" "EstadoPedido" DEFAULT 'EN_PREPARACION',
    "mesa_pedido" INTEGER,
    "mesero_pedido" INTEGER,

    CONSTRAINT "Pedido_pkey" PRIMARY KEY ("id_pedido")
);

-- CreateTable
CREATE TABLE "Comanda" (
    "id_comanda" SERIAL NOT NULL,
    "id_pedido_comanda" INTEGER,
    "creacion_comanda" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comanda_pkey" PRIMARY KEY ("id_comanda")
);

-- CreateTable
CREATE TABLE "DetalleComanda" (
    "id_detalleComanda" SERIAL NOT NULL,
    "id_comanda_dc" INTEGER,
    "id_detalleComandaPadre_dc" INTEGER,
    "id_producto_dc" INTEGER,
    "id_combo_dc" INTEGER,
    "id_receta_usada_dc" INTEGER,
    "id_subcuenta_dc" INTEGER,
    "estado_dc" "EstadoDetalleComanda" DEFAULT 'PREPARANDO',
    "cantidad_producto_dc" INTEGER NOT NULL,
    "precio_unitario_dc" DECIMAL(20,4) NOT NULL,
    "indicaciones_dc" VARCHAR(150),

    CONSTRAINT "DetalleComanda_pkey" PRIMARY KEY ("id_detalleComanda")
);

-- CreateTable
CREATE TABLE "Combo" (
    "id_combo" SERIAL NOT NULL,
    "nombre_combo" VARCHAR(50) NOT NULL,
    "precio_combo" DECIMAL(15,4) NOT NULL,
    "combo_activo" BOOLEAN DEFAULT true,

    CONSTRAINT "Combo_pkey" PRIMARY KEY ("id_combo")
);

-- CreateTable
CREATE TABLE "DetalleCombo" (
    "id_detalleCombo" SERIAL NOT NULL,
    "id_combo_detalleCombo" INTEGER,
    "id_producto_detalleCombo" INTEGER,
    "cantidad_detalleCombo" DECIMAL(10,4),

    CONSTRAINT "DetalleCombo_pkey" PRIMARY KEY ("id_detalleCombo")
);

-- CreateTable
CREATE TABLE "Factura" (
    "id_factura" SERIAL NOT NULL,
    "id_subcuenta_factura" INTEGER,
    "fecha_emision_factura" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "subtotal_factura" DECIMAL(20,4) NOT NULL,
    "monto_servicio_factura" DECIMAL(20,4) NOT NULL,
    "monto_impuestos_factura" DECIMAL(20,4) NOT NULL,
    "monto_total_factura" DECIMAL(20,4) NOT NULL,
    "estado_factura" "EstadoFactura" DEFAULT 'EMITIDA',
    "motivo_anulacion_factura" VARCHAR(150),

    CONSTRAINT "Factura_pkey" PRIMARY KEY ("id_factura")
);

-- CreateTable
CREATE TABLE "Pago" (
    "id_pago" SERIAL NOT NULL,
    "id_factura_pago" INTEGER,
    "id_turno_pago" INTEGER,
    "subtotal_pago" DECIMAL(20,4) NOT NULL,
    "monto_servicio_pago" DECIMAL(20,4) NOT NULL,
    "monto_impuestos_pago" DECIMAL(20,4) NOT NULL,
    "monto_total_pago" DECIMAL(20,4) NOT NULL,
    "metodo_pago" "MetodoPago" NOT NULL,

    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id_pago")
);

-- CreateTable
CREATE TABLE "Caja" (
    "id_caja" SERIAL NOT NULL,
    "nombre_caja" VARCHAR(30) NOT NULL,

    CONSTRAINT "Caja_pkey" PRIMARY KEY ("id_caja")
);

-- CreateTable
CREATE TABLE "Turno" (
    "id_turno" SERIAL NOT NULL,
    "id_caja_turno" INTEGER,
    "id_usuario_turno" INTEGER,
    "fecha_apertura_turno" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "fecha_cierre_turno" TIMESTAMP(6),
    "monto_apertura_turno" DECIMAL(20,4) NOT NULL,
    "monto_cierre_esperado" DECIMAL(20,4),
    "monto_cierre_real_turno" DECIMAL(20,4),
    "estado_turno" "EstadoTurno" DEFAULT 'ABIERTO',

    CONSTRAINT "Turno_pkey" PRIMARY KEY ("id_turno")
);

-- CreateTable
CREATE TABLE "MovimientoCaja" (
    "id_mc" SERIAL NOT NULL,
    "id_turno_mc" INTEGER,
    "tipo_mc" "TipoMovimientoCaja" NOT NULL,
    "monto_mc" DECIMAL(20,4) NOT NULL,
    "concepto_mc" VARCHAR(150) NOT NULL,
    "fecha_mc" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoCaja_pkey" PRIMARY KEY ("id_mc")
);

-- CreateTable
CREATE TABLE "Categoria" (
    "id_categoria" SERIAL NOT NULL,
    "nombre_categoria" VARCHAR(30) NOT NULL,
    "descripcion_categoria" TEXT,

    CONSTRAINT "Categoria_pkey" PRIMARY KEY ("id_categoria")
);

-- CreateTable
CREATE TABLE "Producto" (
    "id_producto" SERIAL NOT NULL,
    "nombre_producto" VARCHAR(25) NOT NULL,
    "precio_producto" DECIMAL(20,4) NOT NULL,
    "categoria_producto" INTEGER,
    "habilitado_producto" BOOLEAN DEFAULT true,
    "imagen_producto" VARCHAR(300),

    CONSTRAINT "Producto_pkey" PRIMARY KEY ("id_producto")
);

-- CreateTable
CREATE TABLE "Receta" (
    "id_receta" SERIAL NOT NULL,
    "id_producto_receta" INTEGER,
    "nombre_receta" VARCHAR(30) NOT NULL,
    "receta_activa" BOOLEAN DEFAULT false,
    "fecha_creacion_receta" DATE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receta_pkey" PRIMARY KEY ("id_receta")
);

-- CreateTable
CREATE TABLE "DetalleReceta" (
    "id_detalleReceta" SERIAL NOT NULL,
    "id_receta_detalleReceta" INTEGER,
    "id_ingrediente_detalleReceta" INTEGER,
    "cantidad_ingrediente_detalleReceta" DECIMAL(10,4) NOT NULL,

    CONSTRAINT "DetalleReceta_pkey" PRIMARY KEY ("id_detalleReceta")
);

-- CreateTable
CREATE TABLE "Ingrediente" (
    "id_ingrediente" SERIAL NOT NULL,
    "nombre_ingrediente" VARCHAR(25) NOT NULL,
    "stock_ingrediente" DECIMAL(20,4) DEFAULT 0,
    "unidades_ingrediente" "UnidadIngrediente" NOT NULL,
    "precio_ingrediente" DECIMAL(20,4) NOT NULL,

    CONSTRAINT "Ingrediente_pkey" PRIMARY KEY ("id_ingrediente")
);

-- CreateTable
CREATE TABLE "DetalleComandaIngrediente" (
    "id_detalleComandaIngrediente" SERIAL NOT NULL,
    "id_detalleComanda_dci" INTEGER,
    "id_ingrediente_dci" INTEGER,
    "cantidad_delta" DECIMAL(10,4) NOT NULL,

    CONSTRAINT "DetalleComandaIngrediente_pkey" PRIMARY KEY ("id_detalleComandaIngrediente")
);

-- CreateTable
CREATE TABLE "MovimientoInventario" (
    "id_movimiento" SERIAL NOT NULL,
    "id_ingrediente_movimiento" INTEGER,
    "id_usuario_movimiento" INTEGER,
    "id_detalleComanda_movimiento" INTEGER,
    "id_movimiento_revertido" INTEGER,
    "tipo_movimiento" "TipoMovimientoInventario",
    "cantidad_movimiento" DECIMAL(20,4) NOT NULL,
    "fecha_movimiento" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "motivo_movimiento" VARCHAR(150),

    CONSTRAINT "MovimientoInventario_pkey" PRIMARY KEY ("id_movimiento")
);

-- CreateTable
CREATE TABLE "Subcuenta" (
    "id_subcuenta" SERIAL NOT NULL,
    "id_pedido_subcuenta" INTEGER,
    "nombre_subcuenta" VARCHAR(30),
    "fecha_creacion_subcuenta" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subcuenta_pkey" PRIMARY KEY ("id_subcuenta")
);

-- CreateTable
CREATE TABLE "SubcuentaDetalleComanda" (
    "id_subcuentaDetalleComanda" SERIAL NOT NULL,
    "id_detalleComanda_sdc" INTEGER,
    "id_subcuenta_sdc" INTEGER,
    "proporcion_sdc" DECIMAL(5,4) NOT NULL,

    CONSTRAINT "SubcuentaDetalleComanda_pkey" PRIMARY KEY ("id_subcuentaDetalleComanda")
);

-- CreateTable
CREATE TABLE "Empleado" (
    "id_empleado" SERIAL NOT NULL,
    "nombre_empleado" VARCHAR(50) NOT NULL,
    "apellido_empleado" VARCHAR(60) NOT NULL,
    "fecha_ingreso_empleado" DATE NOT NULL,
    "fecha_retiro_empleado" DATE,
    "estado_empleado" "EstadoEmpleado" DEFAULT 'ACTIVO',

    CONSTRAINT "Empleado_pkey" PRIMARY KEY ("id_empleado")
);

-- CreateTable
CREATE TABLE "TarifaEmpleado" (
    "id_tarifaEmpleado" SERIAL NOT NULL,
    "id_empleado_tarifaEmpleado" INTEGER,
    "valor_hora_tarifaEmpleado" DECIMAL(10,2) NOT NULL,
    "tarifa_activa" BOOLEAN DEFAULT true,
    "fecha_inicio_tarifaEmpleado" DATE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TarifaEmpleado_pkey" PRIMARY KEY ("id_tarifaEmpleado")
);

-- CreateTable
CREATE TABLE "Jornada" (
    "id_jornada" SERIAL NOT NULL,
    "id_empleado_jornada" INTEGER,
    "fecha_jornada" DATE NOT NULL,
    "estado_jornada" "EstadoJornada" DEFAULT 'ABIERTA',

    CONSTRAINT "Jornada_pkey" PRIMARY KEY ("id_jornada")
);

-- CreateTable
CREATE TABLE "Marcacion" (
    "id_marcacion" SERIAL NOT NULL,
    "id_jornada_marcacion" INTEGER,
    "tipo_marcacion" "TipoMarcacion" NOT NULL,
    "fecha_hora_marcacion" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Marcacion_pkey" PRIMARY KEY ("id_marcacion")
);

-- CreateTable
CREATE TABLE "ConfiguracionNomina" (
    "id_configuracionNomina" SERIAL NOT NULL,
    "aplica_recargo_nocturno" BOOLEAN NOT NULL DEFAULT false,
    "porcentaje_recargo_nocturno" DECIMAL(5,2),
    "hora_inicio_nocturno" TIME,
    "hora_fin_nocturno" TIME,
    "configuracion_activa" BOOLEAN DEFAULT true,
    "fecha_creacion_configuracionNomina" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfiguracionNomina_pkey" PRIMARY KEY ("id_configuracionNomina")
);

-- CreateTable
CREATE TABLE "ConceptoNomina" (
    "id_conceptoNomina" SERIAL NOT NULL,
    "nombre_conceptoNomina" VARCHAR(50) NOT NULL,
    "tipo_conceptoNomina" "TipoConceptoNomina" NOT NULL,
    "aplica_automaticamente" BOOLEAN DEFAULT false,
    "unidad_calculo_conceptoNomina" "UnidadCalculoConceptoNomina",

    CONSTRAINT "ConceptoNomina_pkey" PRIMARY KEY ("id_conceptoNomina")
);

-- CreateTable
CREATE TABLE "ValorConceptoNomina" (
    "id_valorConceptoNomina" SERIAL NOT NULL,
    "id_concepto_valorConceptoNomina" INTEGER,
    "monto_valorConceptoNomina" DECIMAL(10,2) NOT NULL,
    "valor_activo" BOOLEAN DEFAULT true,
    "fecha_inicio_valorConceptoNomina" DATE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValorConceptoNomina_pkey" PRIMARY KEY ("id_valorConceptoNomina")
);

-- CreateTable
CREATE TABLE "ConceptoNominaEmpleado" (
    "id_conceptoNominaEmpleado" SERIAL NOT NULL,
    "id_concepto_cne" INTEGER,
    "id_empleado_cne" INTEGER,
    "id_jornada_cne" INTEGER,
    "fecha_cne" DATE NOT NULL,
    "cantidad_cne" DECIMAL(6,2),
    "valor_unitario_aplicado_cne" DECIMAL(10,2) NOT NULL,
    "monto_cne" DECIMAL(10,2) NOT NULL,
    "observacion_cne" VARCHAR(150),

    CONSTRAINT "ConceptoNominaEmpleado_pkey" PRIMARY KEY ("id_conceptoNominaEmpleado")
);

-- CreateTable
CREATE TABLE "DevengoNomina" (
    "id_devengoNomina" SERIAL NOT NULL,
    "id_empleado_devengoNomina" INTEGER,
    "id_jornada_devengoNomina" INTEGER,
    "id_conceptoNominaEmpleado_devengoNomina" INTEGER,
    "horas_ordinarias_devengoNomina" DECIMAL(6,2),
    "horas_recargo_devengoNomina" DECIMAL(6,2),
    "valor_hora_aplicado_devengoNomina" DECIMAL(10,2),
    "porcentaje_recargo_aplicado_devengoNomina" DECIMAL(5,2),
    "monto_devengoNomina" DECIMAL(10,2) NOT NULL,
    "fecha_devengoNomina" DATE NOT NULL,

    CONSTRAINT "DevengoNomina_pkey" PRIMARY KEY ("id_devengoNomina")
);

-- CreateTable
CREATE TABLE "PagoNomina" (
    "id_pagoNomina" SERIAL NOT NULL,
    "id_empleado_pagoNomina" INTEGER,
    "id_turno_pagoNomina" INTEGER,
    "id_usuario_registra_pagoNomina" INTEGER NOT NULL,
    "monto_pagoNomina" DECIMAL(10,2) NOT NULL,
    "fecha_pagoNomina" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "metodo_pagoNomina" "MetodoPagoNomina" NOT NULL,
    "observacion_pagoNomina" VARCHAR(150),

    CONSTRAINT "PagoNomina_pkey" PRIMARY KEY ("id_pagoNomina")
);

-- CreateTable
CREATE TABLE "PagoNominaDetalle" (
    "id_pagoNominaDetalle" SERIAL NOT NULL,
    "id_pagoNomina_pnd" INTEGER,
    "id_devengoNomina_pnd" INTEGER,
    "monto_aplicado_pnd" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "PagoNominaDetalle_pkey" PRIMARY KEY ("id_pagoNominaDetalle")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_usuario_key" ON "Usuario"("email_usuario");

-- CreateIndex
CREATE INDEX "Usuario_id_empleado_usuario_idx" ON "Usuario"("id_empleado_usuario");

-- CreateIndex
CREATE INDEX "Usuario_id_rol_idx" ON "Usuario"("id_rol");

-- CreateIndex
CREATE INDEX "Mesa_id_zona_mesa_idx" ON "Mesa"("id_zona_mesa");

-- CreateIndex
CREATE INDEX "Mesa_estado_mesa_idx" ON "Mesa"("estado_mesa");

-- CreateIndex
CREATE INDEX "Pedido_mesa_pedido_idx" ON "Pedido"("mesa_pedido");

-- CreateIndex
CREATE INDEX "Pedido_mesero_pedido_idx" ON "Pedido"("mesero_pedido");

-- CreateIndex
CREATE INDEX "Pedido_estado_pedido_idx" ON "Pedido"("estado_pedido");

-- CreateIndex
CREATE INDEX "Comanda_id_pedido_comanda_idx" ON "Comanda"("id_pedido_comanda");

-- CreateIndex
CREATE INDEX "DetalleComanda_id_comanda_dc_idx" ON "DetalleComanda"("id_comanda_dc");

-- CreateIndex
CREATE INDEX "DetalleComanda_id_detalleComandaPadre_dc_idx" ON "DetalleComanda"("id_detalleComandaPadre_dc");

-- CreateIndex
CREATE INDEX "DetalleComanda_id_producto_dc_idx" ON "DetalleComanda"("id_producto_dc");

-- CreateIndex
CREATE INDEX "DetalleComanda_id_combo_dc_idx" ON "DetalleComanda"("id_combo_dc");

-- CreateIndex
CREATE INDEX "DetalleComanda_id_receta_usada_dc_idx" ON "DetalleComanda"("id_receta_usada_dc");

-- CreateIndex
CREATE INDEX "DetalleComanda_id_subcuenta_dc_idx" ON "DetalleComanda"("id_subcuenta_dc");

-- CreateIndex
CREATE INDEX "DetalleCombo_id_combo_detalleCombo_idx" ON "DetalleCombo"("id_combo_detalleCombo");

-- CreateIndex
CREATE INDEX "DetalleCombo_id_producto_detalleCombo_idx" ON "DetalleCombo"("id_producto_detalleCombo");

-- CreateIndex
CREATE INDEX "Factura_id_subcuenta_factura_idx" ON "Factura"("id_subcuenta_factura");

-- CreateIndex
CREATE INDEX "Factura_fecha_emision_factura_idx" ON "Factura"("fecha_emision_factura");

-- CreateIndex
CREATE INDEX "Pago_id_factura_pago_idx" ON "Pago"("id_factura_pago");

-- CreateIndex
CREATE INDEX "Pago_id_turno_pago_idx" ON "Pago"("id_turno_pago");

-- CreateIndex
CREATE INDEX "Turno_id_caja_turno_idx" ON "Turno"("id_caja_turno");

-- CreateIndex
CREATE INDEX "Turno_id_usuario_turno_idx" ON "Turno"("id_usuario_turno");

-- CreateIndex
CREATE INDEX "MovimientoCaja_id_turno_mc_idx" ON "MovimientoCaja"("id_turno_mc");

-- CreateIndex
CREATE INDEX "Producto_categoria_producto_idx" ON "Producto"("categoria_producto");

-- CreateIndex
CREATE INDEX "Receta_id_producto_receta_idx" ON "Receta"("id_producto_receta");

-- CreateIndex
CREATE INDEX "DetalleReceta_id_receta_detalleReceta_idx" ON "DetalleReceta"("id_receta_detalleReceta");

-- CreateIndex
CREATE INDEX "DetalleReceta_id_ingrediente_detalleReceta_idx" ON "DetalleReceta"("id_ingrediente_detalleReceta");

-- CreateIndex
CREATE INDEX "DetalleComandaIngrediente_id_detalleComanda_dci_idx" ON "DetalleComandaIngrediente"("id_detalleComanda_dci");

-- CreateIndex
CREATE INDEX "DetalleComandaIngrediente_id_ingrediente_dci_idx" ON "DetalleComandaIngrediente"("id_ingrediente_dci");

-- CreateIndex
CREATE INDEX "MovimientoInventario_id_ingrediente_movimiento_idx" ON "MovimientoInventario"("id_ingrediente_movimiento");

-- CreateIndex
CREATE INDEX "MovimientoInventario_id_usuario_movimiento_idx" ON "MovimientoInventario"("id_usuario_movimiento");

-- CreateIndex
CREATE INDEX "MovimientoInventario_id_detalleComanda_movimiento_idx" ON "MovimientoInventario"("id_detalleComanda_movimiento");

-- CreateIndex
CREATE INDEX "MovimientoInventario_id_movimiento_revertido_idx" ON "MovimientoInventario"("id_movimiento_revertido");

-- CreateIndex
CREATE INDEX "Subcuenta_id_pedido_subcuenta_idx" ON "Subcuenta"("id_pedido_subcuenta");

-- CreateIndex
CREATE INDEX "SubcuentaDetalleComanda_id_detalleComanda_sdc_idx" ON "SubcuentaDetalleComanda"("id_detalleComanda_sdc");

-- CreateIndex
CREATE INDEX "SubcuentaDetalleComanda_id_subcuenta_sdc_idx" ON "SubcuentaDetalleComanda"("id_subcuenta_sdc");

-- CreateIndex
CREATE INDEX "TarifaEmpleado_id_empleado_tarifaEmpleado_idx" ON "TarifaEmpleado"("id_empleado_tarifaEmpleado");

-- CreateIndex
CREATE INDEX "Jornada_id_empleado_jornada_idx" ON "Jornada"("id_empleado_jornada");

-- CreateIndex
CREATE INDEX "Marcacion_id_jornada_marcacion_idx" ON "Marcacion"("id_jornada_marcacion");

-- CreateIndex
CREATE INDEX "ValorConceptoNomina_id_concepto_valorConceptoNomina_idx" ON "ValorConceptoNomina"("id_concepto_valorConceptoNomina");

-- CreateIndex
CREATE INDEX "ConceptoNominaEmpleado_id_concepto_cne_idx" ON "ConceptoNominaEmpleado"("id_concepto_cne");

-- CreateIndex
CREATE INDEX "ConceptoNominaEmpleado_id_empleado_cne_idx" ON "ConceptoNominaEmpleado"("id_empleado_cne");

-- CreateIndex
CREATE INDEX "ConceptoNominaEmpleado_id_jornada_cne_idx" ON "ConceptoNominaEmpleado"("id_jornada_cne");

-- CreateIndex
CREATE INDEX "DevengoNomina_id_empleado_devengoNomina_idx" ON "DevengoNomina"("id_empleado_devengoNomina");

-- CreateIndex
CREATE INDEX "DevengoNomina_id_jornada_devengoNomina_idx" ON "DevengoNomina"("id_jornada_devengoNomina");

-- CreateIndex
CREATE INDEX "DevengoNomina_id_conceptoNominaEmpleado_devengoNomina_idx" ON "DevengoNomina"("id_conceptoNominaEmpleado_devengoNomina");

-- CreateIndex
CREATE INDEX "DevengoNomina_fecha_devengoNomina_idx" ON "DevengoNomina"("fecha_devengoNomina");

-- CreateIndex
CREATE INDEX "PagoNomina_id_empleado_pagoNomina_idx" ON "PagoNomina"("id_empleado_pagoNomina");

-- CreateIndex
CREATE INDEX "PagoNomina_id_turno_pagoNomina_idx" ON "PagoNomina"("id_turno_pagoNomina");

-- CreateIndex
CREATE INDEX "PagoNomina_id_usuario_registra_pagoNomina_idx" ON "PagoNomina"("id_usuario_registra_pagoNomina");

-- CreateIndex
CREATE INDEX "PagoNomina_fecha_pagoNomina_idx" ON "PagoNomina"("fecha_pagoNomina");

-- CreateIndex
CREATE INDEX "PagoNominaDetalle_id_pagoNomina_pnd_idx" ON "PagoNominaDetalle"("id_pagoNomina_pnd");

-- CreateIndex
CREATE INDEX "PagoNominaDetalle_id_devengoNomina_pnd_idx" ON "PagoNominaDetalle"("id_devengoNomina_pnd");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_id_empleado_usuario_fkey" FOREIGN KEY ("id_empleado_usuario") REFERENCES "Empleado"("id_empleado") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_id_rol_fkey" FOREIGN KEY ("id_rol") REFERENCES "Rol"("id_rol") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mesa" ADD CONSTRAINT "Mesa_id_zona_mesa_fkey" FOREIGN KEY ("id_zona_mesa") REFERENCES "Zona"("id_zona") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_mesa_pedido_fkey" FOREIGN KEY ("mesa_pedido") REFERENCES "Mesa"("id_mesa") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_mesero_pedido_fkey" FOREIGN KEY ("mesero_pedido") REFERENCES "Usuario"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comanda" ADD CONSTRAINT "Comanda_id_pedido_comanda_fkey" FOREIGN KEY ("id_pedido_comanda") REFERENCES "Pedido"("id_pedido") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleComanda" ADD CONSTRAINT "DetalleComanda_id_comanda_dc_fkey" FOREIGN KEY ("id_comanda_dc") REFERENCES "Comanda"("id_comanda") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleComanda" ADD CONSTRAINT "DetalleComanda_id_detalleComandaPadre_dc_fkey" FOREIGN KEY ("id_detalleComandaPadre_dc") REFERENCES "DetalleComanda"("id_detalleComanda") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleComanda" ADD CONSTRAINT "DetalleComanda_id_producto_dc_fkey" FOREIGN KEY ("id_producto_dc") REFERENCES "Producto"("id_producto") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleComanda" ADD CONSTRAINT "DetalleComanda_id_combo_dc_fkey" FOREIGN KEY ("id_combo_dc") REFERENCES "Combo"("id_combo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleComanda" ADD CONSTRAINT "DetalleComanda_id_receta_usada_dc_fkey" FOREIGN KEY ("id_receta_usada_dc") REFERENCES "Receta"("id_receta") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleComanda" ADD CONSTRAINT "DetalleComanda_id_subcuenta_dc_fkey" FOREIGN KEY ("id_subcuenta_dc") REFERENCES "Subcuenta"("id_subcuenta") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleCombo" ADD CONSTRAINT "DetalleCombo_id_combo_detalleCombo_fkey" FOREIGN KEY ("id_combo_detalleCombo") REFERENCES "Combo"("id_combo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleCombo" ADD CONSTRAINT "DetalleCombo_id_producto_detalleCombo_fkey" FOREIGN KEY ("id_producto_detalleCombo") REFERENCES "Producto"("id_producto") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_id_subcuenta_factura_fkey" FOREIGN KEY ("id_subcuenta_factura") REFERENCES "Subcuenta"("id_subcuenta") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_id_factura_pago_fkey" FOREIGN KEY ("id_factura_pago") REFERENCES "Factura"("id_factura") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_id_turno_pago_fkey" FOREIGN KEY ("id_turno_pago") REFERENCES "Turno"("id_turno") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turno" ADD CONSTRAINT "Turno_id_caja_turno_fkey" FOREIGN KEY ("id_caja_turno") REFERENCES "Caja"("id_caja") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turno" ADD CONSTRAINT "Turno_id_usuario_turno_fkey" FOREIGN KEY ("id_usuario_turno") REFERENCES "Usuario"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_id_turno_mc_fkey" FOREIGN KEY ("id_turno_mc") REFERENCES "Turno"("id_turno") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_categoria_producto_fkey" FOREIGN KEY ("categoria_producto") REFERENCES "Categoria"("id_categoria") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receta" ADD CONSTRAINT "Receta_id_producto_receta_fkey" FOREIGN KEY ("id_producto_receta") REFERENCES "Producto"("id_producto") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleReceta" ADD CONSTRAINT "DetalleReceta_id_receta_detalleReceta_fkey" FOREIGN KEY ("id_receta_detalleReceta") REFERENCES "Receta"("id_receta") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleReceta" ADD CONSTRAINT "DetalleReceta_id_ingrediente_detalleReceta_fkey" FOREIGN KEY ("id_ingrediente_detalleReceta") REFERENCES "Ingrediente"("id_ingrediente") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleComandaIngrediente" ADD CONSTRAINT "DetalleComandaIngrediente_id_detalleComanda_dci_fkey" FOREIGN KEY ("id_detalleComanda_dci") REFERENCES "DetalleComanda"("id_detalleComanda") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleComandaIngrediente" ADD CONSTRAINT "DetalleComandaIngrediente_id_ingrediente_dci_fkey" FOREIGN KEY ("id_ingrediente_dci") REFERENCES "Ingrediente"("id_ingrediente") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_id_ingrediente_movimiento_fkey" FOREIGN KEY ("id_ingrediente_movimiento") REFERENCES "Ingrediente"("id_ingrediente") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_id_usuario_movimiento_fkey" FOREIGN KEY ("id_usuario_movimiento") REFERENCES "Usuario"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_id_detalleComanda_movimiento_fkey" FOREIGN KEY ("id_detalleComanda_movimiento") REFERENCES "DetalleComanda"("id_detalleComanda") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_id_movimiento_revertido_fkey" FOREIGN KEY ("id_movimiento_revertido") REFERENCES "MovimientoInventario"("id_movimiento") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subcuenta" ADD CONSTRAINT "Subcuenta_id_pedido_subcuenta_fkey" FOREIGN KEY ("id_pedido_subcuenta") REFERENCES "Pedido"("id_pedido") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcuentaDetalleComanda" ADD CONSTRAINT "SubcuentaDetalleComanda_id_detalleComanda_sdc_fkey" FOREIGN KEY ("id_detalleComanda_sdc") REFERENCES "DetalleComanda"("id_detalleComanda") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcuentaDetalleComanda" ADD CONSTRAINT "SubcuentaDetalleComanda_id_subcuenta_sdc_fkey" FOREIGN KEY ("id_subcuenta_sdc") REFERENCES "Subcuenta"("id_subcuenta") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarifaEmpleado" ADD CONSTRAINT "TarifaEmpleado_id_empleado_tarifaEmpleado_fkey" FOREIGN KEY ("id_empleado_tarifaEmpleado") REFERENCES "Empleado"("id_empleado") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Jornada" ADD CONSTRAINT "Jornada_id_empleado_jornada_fkey" FOREIGN KEY ("id_empleado_jornada") REFERENCES "Empleado"("id_empleado") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Marcacion" ADD CONSTRAINT "Marcacion_id_jornada_marcacion_fkey" FOREIGN KEY ("id_jornada_marcacion") REFERENCES "Jornada"("id_jornada") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValorConceptoNomina" ADD CONSTRAINT "ValorConceptoNomina_id_concepto_valorConceptoNomina_fkey" FOREIGN KEY ("id_concepto_valorConceptoNomina") REFERENCES "ConceptoNomina"("id_conceptoNomina") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptoNominaEmpleado" ADD CONSTRAINT "ConceptoNominaEmpleado_id_concepto_cne_fkey" FOREIGN KEY ("id_concepto_cne") REFERENCES "ConceptoNomina"("id_conceptoNomina") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptoNominaEmpleado" ADD CONSTRAINT "ConceptoNominaEmpleado_id_empleado_cne_fkey" FOREIGN KEY ("id_empleado_cne") REFERENCES "Empleado"("id_empleado") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptoNominaEmpleado" ADD CONSTRAINT "ConceptoNominaEmpleado_id_jornada_cne_fkey" FOREIGN KEY ("id_jornada_cne") REFERENCES "Jornada"("id_jornada") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevengoNomina" ADD CONSTRAINT "DevengoNomina_id_empleado_devengoNomina_fkey" FOREIGN KEY ("id_empleado_devengoNomina") REFERENCES "Empleado"("id_empleado") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevengoNomina" ADD CONSTRAINT "DevengoNomina_id_jornada_devengoNomina_fkey" FOREIGN KEY ("id_jornada_devengoNomina") REFERENCES "Jornada"("id_jornada") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevengoNomina" ADD CONSTRAINT "DevengoNomina_id_conceptoNominaEmpleado_devengoNomina_fkey" FOREIGN KEY ("id_conceptoNominaEmpleado_devengoNomina") REFERENCES "ConceptoNominaEmpleado"("id_conceptoNominaEmpleado") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoNomina" ADD CONSTRAINT "PagoNomina_id_empleado_pagoNomina_fkey" FOREIGN KEY ("id_empleado_pagoNomina") REFERENCES "Empleado"("id_empleado") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoNomina" ADD CONSTRAINT "PagoNomina_id_turno_pagoNomina_fkey" FOREIGN KEY ("id_turno_pagoNomina") REFERENCES "Turno"("id_turno") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoNomina" ADD CONSTRAINT "PagoNomina_id_usuario_registra_pagoNomina_fkey" FOREIGN KEY ("id_usuario_registra_pagoNomina") REFERENCES "Usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoNominaDetalle" ADD CONSTRAINT "PagoNominaDetalle_id_pagoNomina_pnd_fkey" FOREIGN KEY ("id_pagoNomina_pnd") REFERENCES "PagoNomina"("id_pagoNomina") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoNominaDetalle" ADD CONSTRAINT "PagoNominaDetalle_id_devengoNomina_pnd_fkey" FOREIGN KEY ("id_devengoNomina_pnd") REFERENCES "DevengoNomina"("id_devengoNomina") ON DELETE SET NULL ON UPDATE CASCADE;
