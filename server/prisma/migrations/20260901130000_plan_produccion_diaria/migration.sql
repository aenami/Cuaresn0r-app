-- Metas diarias completas para productos o ingredientes. Son informativas y
-- no modifican el stock: la produccion no admite cantidades parciales.
BEGIN;

CREATE TYPE "TipoObjetivoProduccion" AS ENUM ('PRODUCTO', 'INGREDIENTE');
CREATE TYPE "EstadoMetaProduccion" AS ENUM ('PENDIENTE', 'PRODUCIDO', 'NO_PRODUCIDO');

CREATE TABLE "PlanProduccionDiaria" (
  "id_planProduccion" SERIAL NOT NULL,
  "fecha_planProduccion" DATE NOT NULL,
  "tipo_objetivo_planProduccion" "TipoObjetivoProduccion" NOT NULL,
  "id_producto_planProduccion" INTEGER,
  "id_ingrediente_planProduccion" INTEGER,
  "nombre_objetivo_planProduccion" VARCHAR(25) NOT NULL,
  "unidad_objetivo_planProduccion" "UnidadIngrediente" NOT NULL,
  "cantidad_objetivo_planProduccion" DECIMAL(20,4) NOT NULL,
  "estado_planProduccion" "EstadoMetaProduccion" NOT NULL DEFAULT 'PENDIENTE',
  "id_usuario_crea_planProduccion" INTEGER NOT NULL,
  "id_usuario_resuelve_planProduccion" INTEGER,
  "fecha_creacion_planProduccion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fecha_resolucion_planProduccion" TIMESTAMP(6),

  CONSTRAINT "PlanProduccionDiaria_pkey" PRIMARY KEY ("id_planProduccion"),
  CONSTRAINT "PlanProduccionDiaria_objetivo_check" CHECK (
    ("tipo_objetivo_planProduccion" = 'PRODUCTO'
      AND "id_producto_planProduccion" IS NOT NULL
      AND "id_ingrediente_planProduccion" IS NULL)
    OR
    ("tipo_objetivo_planProduccion" = 'INGREDIENTE'
      AND "id_producto_planProduccion" IS NULL
      AND "id_ingrediente_planProduccion" IS NOT NULL)
  ),
  CONSTRAINT "PlanProduccionDiaria_cantidad_check"
    CHECK ("cantidad_objetivo_planProduccion" > 0),
  CONSTRAINT "PlanProduccionDiaria_producto_entero_check" CHECK (
    "tipo_objetivo_planProduccion" <> 'PRODUCTO'
    OR "cantidad_objetivo_planProduccion" = TRUNC("cantidad_objetivo_planProduccion")
  )
);

CREATE UNIQUE INDEX "PlanProduccionDiaria_fecha_planProduccion_id_producto_planProduccion_key"
  ON "PlanProduccionDiaria"("fecha_planProduccion", "id_producto_planProduccion");
CREATE UNIQUE INDEX "PlanProduccionDiaria_fecha_planProduccion_id_ingrediente_planProduccion_key"
  ON "PlanProduccionDiaria"("fecha_planProduccion", "id_ingrediente_planProduccion");
CREATE INDEX "PlanProduccionDiaria_fecha_planProduccion_estado_planProduccion_idx"
  ON "PlanProduccionDiaria"("fecha_planProduccion", "estado_planProduccion");
CREATE INDEX "PlanProduccionDiaria_id_usuario_crea_planProduccion_idx"
  ON "PlanProduccionDiaria"("id_usuario_crea_planProduccion");
CREATE INDEX "PlanProduccionDiaria_id_usuario_resuelve_planProduccion_idx"
  ON "PlanProduccionDiaria"("id_usuario_resuelve_planProduccion");

ALTER TABLE "PlanProduccionDiaria"
  ADD CONSTRAINT "PlanProduccionDiaria_id_producto_planProduccion_fkey"
  FOREIGN KEY ("id_producto_planProduccion") REFERENCES "Producto"("id_producto")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlanProduccionDiaria"
  ADD CONSTRAINT "PlanProduccionDiaria_id_ingrediente_planProduccion_fkey"
  FOREIGN KEY ("id_ingrediente_planProduccion") REFERENCES "Ingrediente"("id_ingrediente")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlanProduccionDiaria"
  ADD CONSTRAINT "PlanProduccionDiaria_id_usuario_crea_planProduccion_fkey"
  FOREIGN KEY ("id_usuario_crea_planProduccion") REFERENCES "Usuario"("id_usuario")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlanProduccionDiaria"
  ADD CONSTRAINT "PlanProduccionDiaria_id_usuario_resuelve_planProduccion_fkey"
  FOREIGN KEY ("id_usuario_resuelve_planProduccion") REFERENCES "Usuario"("id_usuario")
  ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
