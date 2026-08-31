/*
  Warnings:

  - Made the column `id_pedido_comanda` on table `Comanda` required. This step will fail if there are existing NULL values in that column.
  - Made the column `creacion_comanda` on table `Comanda` required. This step will fail if there are existing NULL values in that column.
  - Made the column `combo_activo` on table `Combo` required. This step will fail if there are existing NULL values in that column.
  - Made the column `aplica_automaticamente` on table `ConceptoNomina` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id_concepto_cne` on table `ConceptoNominaEmpleado` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id_empleado_cne` on table `ConceptoNominaEmpleado` required. This step will fail if there are existing NULL values in that column.
  - Made the column `configuracion_activa` on table `ConfiguracionNomina` required. This step will fail if there are existing NULL values in that column.
  - Made the column `fecha_creacion_configuracionNomina` on table `ConfiguracionNomina` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id_comanda_dc` on table `DetalleComanda` required. This step will fail if there are existing NULL values in that column.
  - Made the column `estado_dc` on table `DetalleComanda` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id_detalleComanda_dci` on table `DetalleComandaIngrediente` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id_ingrediente_dci` on table `DetalleComandaIngrediente` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id_combo_detalleCombo` on table `DetalleCombo` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id_producto_detalleCombo` on table `DetalleCombo` required. This step will fail if there are existing NULL values in that column.
  - Made the column `cantidad_detalleCombo` on table `DetalleCombo` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id_receta_detalleReceta` on table `DetalleReceta` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id_ingrediente_detalleReceta` on table `DetalleReceta` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id_empleado_devengoNomina` on table `DevengoNomina` required. This step will fail if there are existing NULL values in that column.
  - Made the column `estado_empleado` on table `Empleado` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id_subcuenta_factura` on table `Factura` required. This step will fail if there are existing NULL values in that column.
  - Made the column `fecha_emision_factura` on table `Factura` required. This step will fail if there are existing NULL values in that column.
  - Made the column `estado_factura` on table `Factura` required. This step will fail if there are existing NULL values in that column.
  - Made the column `stock_ingrediente` on table `Ingrediente` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id_empleado_jornada` on table `Jornada` required. This step will fail if there are existing NULL values in that column.
  - Made the column `estado_jornada` on table `Jornada` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id_jornada_marcacion` on table `Marcacion` required. This step will fail if there are existing NULL values in that column.
  - Made the column `fecha_hora_marcacion` on table `Marcacion` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id_zona_mesa` on table `Mesa` required. This step will fail if there are existing NULL values in that column.
  - Made the column `estado_mesa` on table `Mesa` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id_turno_mc` on table `MovimientoCaja` required. This step will fail if there are existing NULL values in that column.
  - Made the column `fecha_mc` on table `MovimientoCaja` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id_ingrediente_movimiento` on table `MovimientoInventario` required. This step will fail if there are existing NULL values in that column.
  - Made the column `tipo_movimiento` on table `MovimientoInventario` required. This step will fail if there are existing NULL values in that column.
  - Made the column `fecha_movimiento` on table `MovimientoInventario` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id_factura_pago` on table `Pago` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id_turno_pago` on table `Pago` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id_empleado_pagoNomina` on table `PagoNomina` required. This step will fail if there are existing NULL values in that column.
  - Made the column `fecha_pagoNomina` on table `PagoNomina` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id_pagoNomina_pnd` on table `PagoNominaDetalle` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id_devengoNomina_pnd` on table `PagoNominaDetalle` required. This step will fail if there are existing NULL values in that column.
  - Made the column `fecha_pedido` on table `Pedido` required. This step will fail if there are existing NULL values in that column.
  - Made the column `estado_pedido` on table `Pedido` required. This step will fail if there are existing NULL values in that column.
  - Made the column `mesa_pedido` on table `Pedido` required. This step will fail if there are existing NULL values in that column.
  - Made the column `mesero_pedido` on table `Pedido` required. This step will fail if there are existing NULL values in that column.
  - Made the column `habilitado_producto` on table `Producto` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id_producto_receta` on table `Receta` required. This step will fail if there are existing NULL values in that column.
  - Made the column `receta_activa` on table `Receta` required. This step will fail if there are existing NULL values in that column.
  - Made the column `fecha_creacion_receta` on table `Receta` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id_pedido_subcuenta` on table `Subcuenta` required. This step will fail if there are existing NULL values in that column.
  - Made the column `fecha_creacion_subcuenta` on table `Subcuenta` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id_detalleComanda_sdc` on table `SubcuentaDetalleComanda` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id_subcuenta_sdc` on table `SubcuentaDetalleComanda` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id_empleado_tarifaEmpleado` on table `TarifaEmpleado` required. This step will fail if there are existing NULL values in that column.
  - Made the column `tarifa_activa` on table `TarifaEmpleado` required. This step will fail if there are existing NULL values in that column.
  - Made the column `fecha_inicio_tarifaEmpleado` on table `TarifaEmpleado` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id_caja_turno` on table `Turno` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id_usuario_turno` on table `Turno` required. This step will fail if there are existing NULL values in that column.
  - Made the column `fecha_apertura_turno` on table `Turno` required. This step will fail if there are existing NULL values in that column.
  - Made the column `estado_turno` on table `Turno` required. This step will fail if there are existing NULL values in that column.
  - Made the column `email_usuario` on table `Usuario` required. This step will fail if there are existing NULL values in that column.
  - Made the column `fecha_creacion_usuario` on table `Usuario` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id_concepto_valorConceptoNomina` on table `ValorConceptoNomina` required. This step will fail if there are existing NULL values in that column.
  - Made the column `valor_activo` on table `ValorConceptoNomina` required. This step will fail if there are existing NULL values in that column.
  - Made the column `fecha_inicio_valorConceptoNomina` on table `ValorConceptoNomina` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Comanda" DROP CONSTRAINT "Comanda_id_pedido_comanda_fkey";

-- DropForeignKey
ALTER TABLE "ConceptoNominaEmpleado" DROP CONSTRAINT "ConceptoNominaEmpleado_id_concepto_cne_fkey";

-- DropForeignKey
ALTER TABLE "ConceptoNominaEmpleado" DROP CONSTRAINT "ConceptoNominaEmpleado_id_empleado_cne_fkey";

-- DropForeignKey
ALTER TABLE "DetalleComanda" DROP CONSTRAINT "DetalleComanda_id_comanda_dc_fkey";

-- DropForeignKey
ALTER TABLE "DetalleComandaIngrediente" DROP CONSTRAINT "DetalleComandaIngrediente_id_detalleComanda_dci_fkey";

-- DropForeignKey
ALTER TABLE "DetalleComandaIngrediente" DROP CONSTRAINT "DetalleComandaIngrediente_id_ingrediente_dci_fkey";

-- DropForeignKey
ALTER TABLE "DetalleCombo" DROP CONSTRAINT "DetalleCombo_id_combo_detalleCombo_fkey";

-- DropForeignKey
ALTER TABLE "DetalleCombo" DROP CONSTRAINT "DetalleCombo_id_producto_detalleCombo_fkey";

-- DropForeignKey
ALTER TABLE "DetalleReceta" DROP CONSTRAINT "DetalleReceta_id_ingrediente_detalleReceta_fkey";

-- DropForeignKey
ALTER TABLE "DetalleReceta" DROP CONSTRAINT "DetalleReceta_id_receta_detalleReceta_fkey";

-- DropForeignKey
ALTER TABLE "DevengoNomina" DROP CONSTRAINT "DevengoNomina_id_empleado_devengoNomina_fkey";

-- DropForeignKey
ALTER TABLE "Factura" DROP CONSTRAINT "Factura_id_subcuenta_factura_fkey";

-- DropForeignKey
ALTER TABLE "Jornada" DROP CONSTRAINT "Jornada_id_empleado_jornada_fkey";

-- DropForeignKey
ALTER TABLE "Marcacion" DROP CONSTRAINT "Marcacion_id_jornada_marcacion_fkey";

-- DropForeignKey
ALTER TABLE "Mesa" DROP CONSTRAINT "Mesa_id_zona_mesa_fkey";

-- DropForeignKey
ALTER TABLE "MovimientoCaja" DROP CONSTRAINT "MovimientoCaja_id_turno_mc_fkey";

-- DropForeignKey
ALTER TABLE "MovimientoInventario" DROP CONSTRAINT "MovimientoInventario_id_ingrediente_movimiento_fkey";

-- DropForeignKey
ALTER TABLE "Pago" DROP CONSTRAINT "Pago_id_factura_pago_fkey";

-- DropForeignKey
ALTER TABLE "Pago" DROP CONSTRAINT "Pago_id_turno_pago_fkey";

-- DropForeignKey
ALTER TABLE "PagoNomina" DROP CONSTRAINT "PagoNomina_id_empleado_pagoNomina_fkey";

-- DropForeignKey
ALTER TABLE "PagoNominaDetalle" DROP CONSTRAINT "PagoNominaDetalle_id_devengoNomina_pnd_fkey";

-- DropForeignKey
ALTER TABLE "PagoNominaDetalle" DROP CONSTRAINT "PagoNominaDetalle_id_pagoNomina_pnd_fkey";

-- DropForeignKey
ALTER TABLE "Pedido" DROP CONSTRAINT "Pedido_mesa_pedido_fkey";

-- DropForeignKey
ALTER TABLE "Pedido" DROP CONSTRAINT "Pedido_mesero_pedido_fkey";

-- DropForeignKey
ALTER TABLE "Receta" DROP CONSTRAINT "Receta_id_producto_receta_fkey";

-- DropForeignKey
ALTER TABLE "Subcuenta" DROP CONSTRAINT "Subcuenta_id_pedido_subcuenta_fkey";

-- DropForeignKey
ALTER TABLE "SubcuentaDetalleComanda" DROP CONSTRAINT "SubcuentaDetalleComanda_id_detalleComanda_sdc_fkey";

-- DropForeignKey
ALTER TABLE "SubcuentaDetalleComanda" DROP CONSTRAINT "SubcuentaDetalleComanda_id_subcuenta_sdc_fkey";

-- DropForeignKey
ALTER TABLE "TarifaEmpleado" DROP CONSTRAINT "TarifaEmpleado_id_empleado_tarifaEmpleado_fkey";

-- DropForeignKey
ALTER TABLE "Turno" DROP CONSTRAINT "Turno_id_caja_turno_fkey";

-- DropForeignKey
ALTER TABLE "Turno" DROP CONSTRAINT "Turno_id_usuario_turno_fkey";

-- DropForeignKey
ALTER TABLE "ValorConceptoNomina" DROP CONSTRAINT "ValorConceptoNomina_id_concepto_valorConceptoNomina_fkey";

-- AlterTable
ALTER TABLE "Comanda" ALTER COLUMN "id_pedido_comanda" SET NOT NULL,
ALTER COLUMN "creacion_comanda" SET NOT NULL;

-- AlterTable
ALTER TABLE "Combo" ALTER COLUMN "combo_activo" SET NOT NULL;

-- AlterTable
ALTER TABLE "ConceptoNomina" ALTER COLUMN "aplica_automaticamente" SET NOT NULL;

-- AlterTable
ALTER TABLE "ConceptoNominaEmpleado" ALTER COLUMN "id_concepto_cne" SET NOT NULL,
ALTER COLUMN "id_empleado_cne" SET NOT NULL;

-- AlterTable
ALTER TABLE "ConfiguracionNomina" ALTER COLUMN "configuracion_activa" SET NOT NULL,
ALTER COLUMN "fecha_creacion_configuracionNomina" SET NOT NULL;

-- AlterTable
ALTER TABLE "DetalleComanda" ALTER COLUMN "id_comanda_dc" SET NOT NULL,
ALTER COLUMN "estado_dc" SET NOT NULL;

-- AlterTable
ALTER TABLE "DetalleComandaIngrediente" ALTER COLUMN "id_detalleComanda_dci" SET NOT NULL,
ALTER COLUMN "id_ingrediente_dci" SET NOT NULL;

-- AlterTable
ALTER TABLE "DetalleCombo" ALTER COLUMN "id_combo_detalleCombo" SET NOT NULL,
ALTER COLUMN "id_producto_detalleCombo" SET NOT NULL,
ALTER COLUMN "cantidad_detalleCombo" SET NOT NULL;

-- AlterTable
ALTER TABLE "DetalleReceta" ALTER COLUMN "id_receta_detalleReceta" SET NOT NULL,
ALTER COLUMN "id_ingrediente_detalleReceta" SET NOT NULL;

-- AlterTable
ALTER TABLE "DevengoNomina" ALTER COLUMN "id_empleado_devengoNomina" SET NOT NULL;

-- AlterTable
ALTER TABLE "Empleado" ALTER COLUMN "estado_empleado" SET NOT NULL;

-- AlterTable
ALTER TABLE "Factura" ALTER COLUMN "id_subcuenta_factura" SET NOT NULL,
ALTER COLUMN "fecha_emision_factura" SET NOT NULL,
ALTER COLUMN "estado_factura" SET NOT NULL;

-- AlterTable
ALTER TABLE "Ingrediente" ALTER COLUMN "stock_ingrediente" SET NOT NULL;

-- AlterTable
ALTER TABLE "Jornada" ALTER COLUMN "id_empleado_jornada" SET NOT NULL,
ALTER COLUMN "estado_jornada" SET NOT NULL;

-- AlterTable
ALTER TABLE "Marcacion" ALTER COLUMN "id_jornada_marcacion" SET NOT NULL,
ALTER COLUMN "fecha_hora_marcacion" SET NOT NULL;

-- AlterTable
ALTER TABLE "Mesa" ALTER COLUMN "id_zona_mesa" SET NOT NULL,
ALTER COLUMN "estado_mesa" SET NOT NULL;

-- AlterTable
ALTER TABLE "MovimientoCaja" ALTER COLUMN "id_turno_mc" SET NOT NULL,
ALTER COLUMN "fecha_mc" SET NOT NULL;

-- AlterTable
ALTER TABLE "MovimientoInventario" ALTER COLUMN "id_ingrediente_movimiento" SET NOT NULL,
ALTER COLUMN "tipo_movimiento" SET NOT NULL,
ALTER COLUMN "fecha_movimiento" SET NOT NULL;

-- AlterTable
ALTER TABLE "Pago" ALTER COLUMN "id_factura_pago" SET NOT NULL,
ALTER COLUMN "id_turno_pago" SET NOT NULL;

-- AlterTable
ALTER TABLE "PagoNomina" ALTER COLUMN "id_empleado_pagoNomina" SET NOT NULL,
ALTER COLUMN "fecha_pagoNomina" SET NOT NULL;

-- AlterTable
ALTER TABLE "PagoNominaDetalle" ALTER COLUMN "id_pagoNomina_pnd" SET NOT NULL,
ALTER COLUMN "id_devengoNomina_pnd" SET NOT NULL;

-- AlterTable
ALTER TABLE "Pedido" ALTER COLUMN "fecha_pedido" SET NOT NULL,
ALTER COLUMN "estado_pedido" SET NOT NULL,
ALTER COLUMN "mesa_pedido" SET NOT NULL,
ALTER COLUMN "mesero_pedido" SET NOT NULL;

-- AlterTable
ALTER TABLE "Producto" ALTER COLUMN "habilitado_producto" SET NOT NULL;

-- AlterTable
ALTER TABLE "Receta" ALTER COLUMN "id_producto_receta" SET NOT NULL,
ALTER COLUMN "receta_activa" SET NOT NULL,
ALTER COLUMN "fecha_creacion_receta" SET NOT NULL;

-- AlterTable
ALTER TABLE "Subcuenta" ALTER COLUMN "id_pedido_subcuenta" SET NOT NULL,
ALTER COLUMN "fecha_creacion_subcuenta" SET NOT NULL;

-- AlterTable
ALTER TABLE "SubcuentaDetalleComanda" ALTER COLUMN "id_detalleComanda_sdc" SET NOT NULL,
ALTER COLUMN "id_subcuenta_sdc" SET NOT NULL;

-- AlterTable
ALTER TABLE "TarifaEmpleado" ALTER COLUMN "id_empleado_tarifaEmpleado" SET NOT NULL,
ALTER COLUMN "tarifa_activa" SET NOT NULL,
ALTER COLUMN "fecha_inicio_tarifaEmpleado" SET NOT NULL;

-- AlterTable
ALTER TABLE "Turno" ALTER COLUMN "id_caja_turno" SET NOT NULL,
ALTER COLUMN "id_usuario_turno" SET NOT NULL,
ALTER COLUMN "fecha_apertura_turno" SET NOT NULL,
ALTER COLUMN "estado_turno" SET NOT NULL;

-- AlterTable
ALTER TABLE "Usuario" ALTER COLUMN "email_usuario" SET NOT NULL,
ALTER COLUMN "fecha_creacion_usuario" SET NOT NULL;

-- AlterTable
ALTER TABLE "ValorConceptoNomina" ALTER COLUMN "id_concepto_valorConceptoNomina" SET NOT NULL,
ALTER COLUMN "valor_activo" SET NOT NULL,
ALTER COLUMN "fecha_inicio_valorConceptoNomina" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Mesa" ADD CONSTRAINT "Mesa_id_zona_mesa_fkey" FOREIGN KEY ("id_zona_mesa") REFERENCES "Zona"("id_zona") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_mesa_pedido_fkey" FOREIGN KEY ("mesa_pedido") REFERENCES "Mesa"("id_mesa") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_mesero_pedido_fkey" FOREIGN KEY ("mesero_pedido") REFERENCES "Usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comanda" ADD CONSTRAINT "Comanda_id_pedido_comanda_fkey" FOREIGN KEY ("id_pedido_comanda") REFERENCES "Pedido"("id_pedido") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleComanda" ADD CONSTRAINT "DetalleComanda_id_comanda_dc_fkey" FOREIGN KEY ("id_comanda_dc") REFERENCES "Comanda"("id_comanda") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleCombo" ADD CONSTRAINT "DetalleCombo_id_combo_detalleCombo_fkey" FOREIGN KEY ("id_combo_detalleCombo") REFERENCES "Combo"("id_combo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleCombo" ADD CONSTRAINT "DetalleCombo_id_producto_detalleCombo_fkey" FOREIGN KEY ("id_producto_detalleCombo") REFERENCES "Producto"("id_producto") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_id_subcuenta_factura_fkey" FOREIGN KEY ("id_subcuenta_factura") REFERENCES "Subcuenta"("id_subcuenta") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_id_factura_pago_fkey" FOREIGN KEY ("id_factura_pago") REFERENCES "Factura"("id_factura") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_id_turno_pago_fkey" FOREIGN KEY ("id_turno_pago") REFERENCES "Turno"("id_turno") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turno" ADD CONSTRAINT "Turno_id_caja_turno_fkey" FOREIGN KEY ("id_caja_turno") REFERENCES "Caja"("id_caja") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turno" ADD CONSTRAINT "Turno_id_usuario_turno_fkey" FOREIGN KEY ("id_usuario_turno") REFERENCES "Usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_id_turno_mc_fkey" FOREIGN KEY ("id_turno_mc") REFERENCES "Turno"("id_turno") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receta" ADD CONSTRAINT "Receta_id_producto_receta_fkey" FOREIGN KEY ("id_producto_receta") REFERENCES "Producto"("id_producto") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleReceta" ADD CONSTRAINT "DetalleReceta_id_receta_detalleReceta_fkey" FOREIGN KEY ("id_receta_detalleReceta") REFERENCES "Receta"("id_receta") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleReceta" ADD CONSTRAINT "DetalleReceta_id_ingrediente_detalleReceta_fkey" FOREIGN KEY ("id_ingrediente_detalleReceta") REFERENCES "Ingrediente"("id_ingrediente") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleComandaIngrediente" ADD CONSTRAINT "DetalleComandaIngrediente_id_detalleComanda_dci_fkey" FOREIGN KEY ("id_detalleComanda_dci") REFERENCES "DetalleComanda"("id_detalleComanda") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleComandaIngrediente" ADD CONSTRAINT "DetalleComandaIngrediente_id_ingrediente_dci_fkey" FOREIGN KEY ("id_ingrediente_dci") REFERENCES "Ingrediente"("id_ingrediente") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_id_ingrediente_movimiento_fkey" FOREIGN KEY ("id_ingrediente_movimiento") REFERENCES "Ingrediente"("id_ingrediente") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subcuenta" ADD CONSTRAINT "Subcuenta_id_pedido_subcuenta_fkey" FOREIGN KEY ("id_pedido_subcuenta") REFERENCES "Pedido"("id_pedido") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcuentaDetalleComanda" ADD CONSTRAINT "SubcuentaDetalleComanda_id_detalleComanda_sdc_fkey" FOREIGN KEY ("id_detalleComanda_sdc") REFERENCES "DetalleComanda"("id_detalleComanda") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcuentaDetalleComanda" ADD CONSTRAINT "SubcuentaDetalleComanda_id_subcuenta_sdc_fkey" FOREIGN KEY ("id_subcuenta_sdc") REFERENCES "Subcuenta"("id_subcuenta") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarifaEmpleado" ADD CONSTRAINT "TarifaEmpleado_id_empleado_tarifaEmpleado_fkey" FOREIGN KEY ("id_empleado_tarifaEmpleado") REFERENCES "Empleado"("id_empleado") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Jornada" ADD CONSTRAINT "Jornada_id_empleado_jornada_fkey" FOREIGN KEY ("id_empleado_jornada") REFERENCES "Empleado"("id_empleado") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Marcacion" ADD CONSTRAINT "Marcacion_id_jornada_marcacion_fkey" FOREIGN KEY ("id_jornada_marcacion") REFERENCES "Jornada"("id_jornada") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValorConceptoNomina" ADD CONSTRAINT "ValorConceptoNomina_id_concepto_valorConceptoNomina_fkey" FOREIGN KEY ("id_concepto_valorConceptoNomina") REFERENCES "ConceptoNomina"("id_conceptoNomina") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptoNominaEmpleado" ADD CONSTRAINT "ConceptoNominaEmpleado_id_concepto_cne_fkey" FOREIGN KEY ("id_concepto_cne") REFERENCES "ConceptoNomina"("id_conceptoNomina") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptoNominaEmpleado" ADD CONSTRAINT "ConceptoNominaEmpleado_id_empleado_cne_fkey" FOREIGN KEY ("id_empleado_cne") REFERENCES "Empleado"("id_empleado") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevengoNomina" ADD CONSTRAINT "DevengoNomina_id_empleado_devengoNomina_fkey" FOREIGN KEY ("id_empleado_devengoNomina") REFERENCES "Empleado"("id_empleado") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoNomina" ADD CONSTRAINT "PagoNomina_id_empleado_pagoNomina_fkey" FOREIGN KEY ("id_empleado_pagoNomina") REFERENCES "Empleado"("id_empleado") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoNominaDetalle" ADD CONSTRAINT "PagoNominaDetalle_id_pagoNomina_pnd_fkey" FOREIGN KEY ("id_pagoNomina_pnd") REFERENCES "PagoNomina"("id_pagoNomina") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoNominaDetalle" ADD CONSTRAINT "PagoNominaDetalle_id_devengoNomina_pnd_fkey" FOREIGN KEY ("id_devengoNomina_pnd") REFERENCES "DevengoNomina"("id_devengoNomina") ON DELETE RESTRICT ON UPDATE CASCADE;
