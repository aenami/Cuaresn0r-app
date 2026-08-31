-- CreateEnum
CREATE TYPE "DestinoExcedente" AS ENUM ('CASA', 'PROPINA');

-- AlterTable
ALTER TABLE "Pago" ADD COLUMN     "destino_excedente_pago" "DestinoExcedente",
ADD COLUMN     "monto_excedente_pago" DECIMAL(20,4) NOT NULL DEFAULT 0;
