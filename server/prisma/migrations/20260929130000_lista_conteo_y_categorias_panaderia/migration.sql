CREATE TABLE "CategoriaPanaderia" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,
    "tipo" "TipoArticuloPanaderia" NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "fechaCreacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoriaPanaderia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CategoriaPanaderia_tipo_nombre_key" ON "CategoriaPanaderia"("tipo", "nombre");

INSERT INTO "CategoriaPanaderia" ("nombre", "tipo") VALUES
    ('Panes', 'PANADERIA'),
    ('Postres', 'PASTELERIA'),
    ('Productos externos', 'EXTERNO');

ALTER TABLE "ArticuloPanaderia" ADD COLUMN "categoriaId" INTEGER;
CREATE INDEX "ArticuloPanaderia_categoriaId_idx" ON "ArticuloPanaderia"("categoriaId");
ALTER TABLE "ArticuloPanaderia" ADD CONSTRAINT "ArticuloPanaderia_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaPanaderia"("id") ON DELETE SET NULL ON UPDATE CASCADE;
UPDATE "ArticuloPanaderia" AS articulo
SET "categoriaId" = categoria."id"
FROM "CategoriaPanaderia" AS categoria
WHERE articulo."categoriaId" IS NULL AND articulo."tipo" = categoria."tipo";

CREATE TABLE "ElementoConteoPanaderia" (
    "id" SERIAL NOT NULL,
    "articuloId" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fechaInicio" DATE NOT NULL,
    "fechaFin" DATE,

    CONSTRAINT "ElementoConteoPanaderia_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ElementoConteoPanaderia_articuloId_activo_idx" ON "ElementoConteoPanaderia"("articuloId", "activo");
CREATE UNIQUE INDEX "ElementoConteoPanaderia_unico_activo" ON "ElementoConteoPanaderia"("articuloId") WHERE "activo" = true;
ALTER TABLE "ElementoConteoPanaderia" ADD CONSTRAINT "ElementoConteoPanaderia_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "ArticuloPanaderia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Conserva la obligacion de contar los articulos activos existentes tras el
-- despliegue; la seleccion puede ajustarse desde la interfaz sin perder fotos.
INSERT INTO "ElementoConteoPanaderia" ("articuloId", "fechaInicio")
SELECT "id", (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::date
FROM "ArticuloPanaderia"
WHERE "activo" = true;

CREATE TABLE "SalidaProductoRestaurante" (
    "id" SERIAL NOT NULL,
    "productoId" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "motivo" VARCHAR(150) NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "fecha" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalidaProductoRestaurante_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SalidaProductoRestaurante_productoId_fecha_idx" ON "SalidaProductoRestaurante"("productoId", "fecha");
CREATE INDEX "SalidaProductoRestaurante_fecha_idx" ON "SalidaProductoRestaurante"("fecha");
ALTER TABLE "SalidaProductoRestaurante" ADD CONSTRAINT "SalidaProductoRestaurante_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id_producto") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalidaProductoRestaurante" ADD CONSTRAINT "SalidaProductoRestaurante_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalidaProductoRestaurante" ADD CONSTRAINT "SalidaProductoRestaurante_cantidad_check" CHECK ("cantidad" > 0);

ALTER TYPE "TipoMovimientoPanaderia" ADD VALUE 'SALIDA_MANUAL';
ALTER TYPE "TipoMovimientoInventario" ADD VALUE 'SALIDA_MANUAL';
ALTER TABLE "ConteoPanaderia" ADD COLUMN "salidasJustificadas" DECIMAL(20,4) NOT NULL DEFAULT 0;
