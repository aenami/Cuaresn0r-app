ALTER TYPE "TipoMovimientoPanaderia" ADD VALUE 'CONSUMO_RECETA';

ALTER TABLE "ConteoPanaderia" ADD COLUMN "consumoReceta" DECIMAL(20,4) NOT NULL DEFAULT 0;

CREATE TABLE "RecetaPanaderia" (
  "id" SERIAL PRIMARY KEY,
  "articuloId" INTEGER NOT NULL REFERENCES "ArticuloPanaderia"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "nombre" VARCHAR(80) NOT NULL,
  "activa" BOOLEAN NOT NULL DEFAULT true,
  "fechaCreacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "RecetaPanaderia_articuloId_idx" ON "RecetaPanaderia"("articuloId");
CREATE UNIQUE INDEX "RecetaPanaderia_activa_por_articulo" ON "RecetaPanaderia"("articuloId") WHERE "activa" = true;

CREATE TABLE "DetalleRecetaPanaderia" (
  "id" SERIAL PRIMARY KEY,
  "recetaId" INTEGER NOT NULL REFERENCES "RecetaPanaderia"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "insumoId" INTEGER NOT NULL REFERENCES "ArticuloPanaderia"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "cantidadUnidad" DECIMAL(20,4) NOT NULL,
  CONSTRAINT "DetalleRecetaPanaderia_cantidad_positive" CHECK ("cantidadUnidad" > 0)
);
CREATE UNIQUE INDEX "DetalleRecetaPanaderia_recetaId_insumoId_key" ON "DetalleRecetaPanaderia"("recetaId", "insumoId");
CREATE INDEX "DetalleRecetaPanaderia_insumoId_idx" ON "DetalleRecetaPanaderia"("insumoId");

ALTER TABLE "MovimientoPanaderia" ADD COLUMN "recetaId" INTEGER REFERENCES "RecetaPanaderia"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "MovimientoPanaderia_recetaId_idx" ON "MovimientoPanaderia"("recetaId");
