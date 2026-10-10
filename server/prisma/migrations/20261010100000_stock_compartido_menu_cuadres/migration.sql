ALTER TABLE "RemisionPanaderia" ADD COLUMN "areaOrigen" "AreaNegocio" NOT NULL DEFAULT 'PANADERIA', ADD COLUMN "areaDestino" "AreaNegocio" NOT NULL DEFAULT 'RESTAURANTE';
ALTER TABLE "DetalleRemisionPanaderia" ALTER COLUMN "articuloId" DROP NOT NULL, ALTER COLUMN "ingredienteDestinoId" DROP NOT NULL;
ALTER TABLE "DetalleRemisionPanaderia" ADD COLUMN "ingredienteOrigenId" INTEGER, ADD COLUMN "articuloDestinoId" INTEGER, ADD COLUMN "detalleComandaId" INTEGER;
ALTER TABLE "DetalleRemisionPanaderia" ADD FOREIGN KEY ("ingredienteOrigenId") REFERENCES "Ingrediente"("id_ingrediente") ON DELETE RESTRICT ON UPDATE CASCADE, ADD FOREIGN KEY ("articuloDestinoId") REFERENCES "ArticuloPanaderia"("id") ON DELETE RESTRICT ON UPDATE CASCADE, ADD FOREIGN KEY ("detalleComandaId") REFERENCES "DetalleComanda"("id_detalleComanda") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "DetalleRemisionPanaderia_detalleComandaId_key" ON "DetalleRemisionPanaderia"("detalleComandaId");
ALTER TABLE "DetalleRemisionPanaderia" ADD COLUMN "historialEdiciones" JSONB;
ALTER TABLE "Producto" ADD COLUMN "articuloCompartidoId" INTEGER, ADD COLUMN "precioInternoCompartido" DECIMAL(20,4), ADD COLUMN "tipoMenu" VARCHAR(10);
ALTER TABLE "Producto" ADD FOREIGN KEY ("articuloCompartidoId") REFERENCES "ArticuloPanaderia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_compartido_valido" CHECK (("articuloCompartidoId" IS NULL AND "precioInternoCompartido" IS NULL) OR ("articuloCompartidoId" IS NOT NULL AND "precioInternoCompartido" IS NOT NULL AND "precioInternoCompartido" > 0 AND "tipoMenu" IS NULL));
ALTER TABLE "RemisionPanaderia" ADD CONSTRAINT "Remision_areas_distintas" CHECK ("areaOrigen" <> "areaDestino");
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_tipoMenu_valido" CHECK ("tipoMenu" IS NULL OR "tipoMenu" IN ('EJECUTIVO','BANDEJA'));
CREATE TABLE "ReservaPanaderia" (
  "id" SERIAL PRIMARY KEY, "detalleId" INTEGER NOT NULL UNIQUE, "articuloId" INTEGER NOT NULL,
  "cantidad" DECIMAL(20,4) NOT NULL CHECK ("cantidad" > 0), "precioInterno" DECIMAL(20,4) NOT NULL CHECK ("precioInterno" > 0),
  "estado" VARCHAR(12) NOT NULL DEFAULT 'RESERVADA' CHECK ("estado" IN ('RESERVADA','CONSUMIDA','LIBERADA')),
  "fechaCreacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("detalleId") REFERENCES "DetalleComanda"("id_detalleComanda") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("articuloId") REFERENCES "ArticuloPanaderia"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ReservaPanaderia_articuloId_estado_idx" ON "ReservaPanaderia"("articuloId","estado");
CREATE TABLE "MenuOpcionDiaria" (
  "id" SERIAL PRIMARY KEY, "productoId" INTEGER NOT NULL, "componenteId" INTEGER NOT NULL, "fecha" DATE NOT NULL, "grupo" VARCHAR(12) NOT NULL CHECK ("grupo" IN ('CALDO','PRINCIPIO','PROTEINA')),
  FOREIGN KEY ("productoId") REFERENCES "Producto"("id_producto") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("componenteId") REFERENCES "Producto"("id_producto") ON DELETE RESTRICT ON UPDATE CASCADE,
  UNIQUE ("productoId","fecha","grupo","componenteId")
);
ALTER TABLE "Turno" ADD COLUMN "transferencia_real_cierre" DECIMAL(20,4), ADD COLUMN "tarjeta_real_cierre" DECIMAL(20,4), ADD COLUMN "cuadre_inventario_diario" JSONB;
CREATE TABLE "CorreccionCuadre" (
  "id" SERIAL PRIMARY KEY, "turnoId" INTEGER NOT NULL, "usuarioId" INTEGER NOT NULL, "motivo" VARCHAR(300) NOT NULL,
  "anterior" JSONB NOT NULL, "nuevo" JSONB NOT NULL, "fecha" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("turnoId") REFERENCES "Turno"("id_turno") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "CorreccionCuadre_turnoId_fecha_idx" ON "CorreccionCuadre"("turnoId","fecha");
