-- AlterTable
ALTER TABLE "Categoria" ADD COLUMN     "es_adicion" BOOLEAN NOT NULL DEFAULT false;

-- Retrocompatibilidad: la antigua categoria plana "Adiciones" pasa a ser una
-- categoria de adiciones para que las adiciones existentes se sigan ofreciendo.
UPDATE "Categoria" SET "es_adicion" = true WHERE lower("nombre_categoria") = 'adiciones';
