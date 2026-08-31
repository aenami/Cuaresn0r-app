-- AlterTable
ALTER TABLE "Pago" ADD COLUMN     "fecha_pago" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Turno" ADD COLUMN     "conteo_cierre_turno" JSONB;
