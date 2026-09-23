CREATE TYPE "TipoTurno" AS ENUM ('MANANA', 'TARDE_NOCHE', 'UNICO');
ALTER TABLE "Turno" ADD COLUMN "tipo_turno" "TipoTurno",
  ADD COLUMN "conteo_inventario_cierre_turno" JSONB;
ALTER TABLE "DetalleComanda" ADD COLUMN "fecha_entrega_dc" TIMESTAMP(6);
CREATE INDEX "DetalleComanda_fecha_entrega_dc_estado_dc_idx"
  ON "DetalleComanda"("fecha_entrega_dc", "estado_dc");
-- No se inventa una fecha de entrega para registros anteriores.
