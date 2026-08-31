-- AlterEnum
ALTER TYPE "EstadoMesa" ADD VALUE 'DESACTIVADA';

-- AlterTable
ALTER TABLE "Mesa" ADD COLUMN     "numero_mesa" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Producto" ADD COLUMN     "descripcion_producto" VARCHAR(300);

-- CreateIndex
CREATE UNIQUE INDEX "Rol_nombre_rol_key" ON "Rol"("nombre_rol");
