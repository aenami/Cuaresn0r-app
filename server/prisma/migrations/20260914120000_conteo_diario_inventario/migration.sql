-- Permite registrar compras de productos terminados ademas de ingredientes.
ALTER TABLE "DetalleCuentaPorPagar"
ADD COLUMN "id_producto_detalleCuenta" INTEGER;

ALTER TABLE "DetalleCuentaPorPagar"
ALTER COLUMN "id_ingrediente_detalleCuenta" DROP NOT NULL;

ALTER TABLE "DetalleCuentaPorPagar"
ADD CONSTRAINT "DetalleCuentaPorPagar_objetivo_check"
CHECK (num_nonnulls("id_ingrediente_detalleCuenta", "id_producto_detalleCuenta") = 1);

CREATE UNIQUE INDEX "DetalleCuentaPorPagar_id_cuentaPorPagar_detalle_id_producto_key"
ON "DetalleCuentaPorPagar"("id_cuentaPorPagar_detalle", "id_producto_detalleCuenta");

CREATE INDEX "DetalleCuentaPorPagar_id_producto_detalleCuenta_idx"
ON "DetalleCuentaPorPagar"("id_producto_detalleCuenta");

ALTER TABLE "DetalleCuentaPorPagar"
ADD CONSTRAINT "DetalleCuentaPorPagar_id_producto_detalleCuenta_fkey"
FOREIGN KEY ("id_producto_detalleCuenta") REFERENCES "Producto"("id_producto")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- La hoja diaria conserva una fotografia auditable de cada cierre manual.
CREATE TYPE "EstadoConteoInventario" AS ENUM ('PENDIENTE', 'FINALIZADO');

CREATE TABLE "ConteoInventarioDiario" (
  "id_conteoInventario" SERIAL NOT NULL,
  "fecha_conteoInventario" DATE NOT NULL,
  "tipo_objetivo_conteoInventario" "TipoObjetivoProduccion" NOT NULL,
  "id_producto_conteoInventario" INTEGER,
  "id_ingrediente_conteoInventario" INTEGER,
  "nombre_objetivo_conteoInventario" VARCHAR(25) NOT NULL,
  "unidad_objetivo_conteoInventario" "UnidadIngrediente" NOT NULL,
  "cantidad_anterior_conteoInventario" DECIMAL(20,4) NOT NULL,
  "fecha_anterior_conteoInventario" DATE,
  "cantidad_entradas_conteoInventario" DECIMAL(20,4) NOT NULL DEFAULT 0,
  "cantidad_fisica_conteoInventario" DECIMAL(20,4),
  "cantidad_salida_conteoInventario" DECIMAL(20,4),
  "stock_sistema_conteoInventario" DECIMAL(20,4),
  "estado_conteoInventario" "EstadoConteoInventario" NOT NULL DEFAULT 'PENDIENTE',
  "id_usuario_crea_conteoInventario" INTEGER NOT NULL,
  "id_usuario_cierra_conteoInventario" INTEGER,
  "fecha_creacion_conteoInventario" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fecha_finalizacion_conteoInventario" TIMESTAMP(6),

  CONSTRAINT "ConteoInventarioDiario_pkey" PRIMARY KEY ("id_conteoInventario"),
  CONSTRAINT "ConteoInventarioDiario_objetivo_check"
    CHECK (num_nonnulls("id_producto_conteoInventario", "id_ingrediente_conteoInventario") = 1),
  CONSTRAINT "ConteoInventarioDiario_estado_check"
    CHECK (
      ("estado_conteoInventario" = 'PENDIENTE'
        AND "cantidad_fisica_conteoInventario" IS NULL
        AND "cantidad_salida_conteoInventario" IS NULL
        AND "id_usuario_cierra_conteoInventario" IS NULL
        AND "fecha_finalizacion_conteoInventario" IS NULL)
      OR
      ("estado_conteoInventario" = 'FINALIZADO'
        AND "cantidad_fisica_conteoInventario" IS NOT NULL
        AND "cantidad_salida_conteoInventario" IS NOT NULL
        AND "id_usuario_cierra_conteoInventario" IS NOT NULL
        AND "fecha_finalizacion_conteoInventario" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "ConteoInventarioDiario_fecha_producto_key"
ON "ConteoInventarioDiario"("fecha_conteoInventario", "id_producto_conteoInventario");

CREATE UNIQUE INDEX "ConteoInventarioDiario_fecha_ingrediente_key"
ON "ConteoInventarioDiario"("fecha_conteoInventario", "id_ingrediente_conteoInventario");

CREATE INDEX "ConteoInventarioDiario_fecha_estado_idx"
ON "ConteoInventarioDiario"("fecha_conteoInventario", "estado_conteoInventario");

CREATE INDEX "ConteoInventarioDiario_usuario_crea_idx"
ON "ConteoInventarioDiario"("id_usuario_crea_conteoInventario");

CREATE INDEX "ConteoInventarioDiario_usuario_cierra_idx"
ON "ConteoInventarioDiario"("id_usuario_cierra_conteoInventario");

ALTER TABLE "ConteoInventarioDiario"
ADD CONSTRAINT "ConteoInventarioDiario_producto_fkey"
FOREIGN KEY ("id_producto_conteoInventario") REFERENCES "Producto"("id_producto")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConteoInventarioDiario"
ADD CONSTRAINT "ConteoInventarioDiario_ingrediente_fkey"
FOREIGN KEY ("id_ingrediente_conteoInventario") REFERENCES "Ingrediente"("id_ingrediente")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConteoInventarioDiario"
ADD CONSTRAINT "ConteoInventarioDiario_usuario_crea_fkey"
FOREIGN KEY ("id_usuario_crea_conteoInventario") REFERENCES "Usuario"("id_usuario")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConteoInventarioDiario"
ADD CONSTRAINT "ConteoInventarioDiario_usuario_cierra_fkey"
FOREIGN KEY ("id_usuario_cierra_conteoInventario") REFERENCES "Usuario"("id_usuario")
ON DELETE RESTRICT ON UPDATE CASCADE;
