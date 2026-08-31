-- CreateEnum
CREATE TYPE "DestinoImpresion" AS ENUM ('COCINA', 'BARRA');

-- CreateEnum
CREATE TYPE "EstadoImpresion" AS ENUM ('PENDIENTE', 'IMPRESA', 'FALLIDA');

-- AlterTable
ALTER TABLE "Categoria" ADD COLUMN     "destino_categoria" "DestinoImpresion" NOT NULL DEFAULT 'COCINA';

-- CreateTable
CREATE TABLE "Impresora" (
    "id_impresora" SERIAL NOT NULL,
    "nombre_impresora" VARCHAR(30) NOT NULL,
    "destino_impresora" "DestinoImpresion" NOT NULL,
    "host_impresora" VARCHAR(45) NOT NULL,
    "puerto_impresora" INTEGER NOT NULL DEFAULT 9100,
    "ancho_papel_impresora" INTEGER NOT NULL DEFAULT 80,
    "impresora_activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Impresora_pkey" PRIMARY KEY ("id_impresora")
);

-- CreateTable
CREATE TABLE "ImpresionComanda" (
    "id_impresionComanda" SERIAL NOT NULL,
    "id_comanda_impresion" INTEGER NOT NULL,
    "destino_impresion" "DestinoImpresion" NOT NULL,
    "estado_impresion" "EstadoImpresion" NOT NULL DEFAULT 'PENDIENTE',
    "intentos_impresion" INTEGER NOT NULL DEFAULT 0,
    "motivo_fallo" VARCHAR(200),
    "fecha_creacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImpresionComanda_pkey" PRIMARY KEY ("id_impresionComanda")
);

-- CreateIndex
CREATE INDEX "ImpresionComanda_estado_impresion_idx" ON "ImpresionComanda"("estado_impresion");

-- CreateIndex
CREATE UNIQUE INDEX "ImpresionComanda_id_comanda_impresion_destino_impresion_key" ON "ImpresionComanda"("id_comanda_impresion", "destino_impresion");

-- AddForeignKey
ALTER TABLE "ImpresionComanda" ADD CONSTRAINT "ImpresionComanda_id_comanda_impresion_fkey" FOREIGN KEY ("id_comanda_impresion") REFERENCES "Comanda"("id_comanda") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Indice unico parcial: a lo sumo UNA impresora activa por destino (mismo
-- patron que receta_activa_por_producto). Solo existe en el SQL, no en el
-- schema de Prisma.
CREATE UNIQUE INDEX "impresora_activa_por_destino"
  ON "Impresora" ("destino_impresora") WHERE "impresora_activa" = true;
