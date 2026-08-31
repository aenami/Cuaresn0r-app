-- Domicilios: un Pedido ahora puede ser de MESA o DOMICILIO. El domicilio no
-- ocupa una mesa fisica del salon, por eso mesa_pedido pasa a ser opcional
-- (null) y el FK a Mesa se vuelve ON DELETE SET NULL. Se agregan los datos de
-- entrega del cliente (solo se llenan para DOMICILIO).

-- CreateEnum
CREATE TYPE "TipoPedido" AS ENUM ('MESA', 'DOMICILIO');

-- DropForeignKey
ALTER TABLE "Pedido" DROP CONSTRAINT "Pedido_mesa_pedido_fkey";

-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "direccion_cliente_pedido" VARCHAR(150),
ADD COLUMN     "nombre_cliente_pedido" VARCHAR(80),
ADD COLUMN     "telefono_cliente_pedido" VARCHAR(30),
ADD COLUMN     "tipo_pedido" "TipoPedido" NOT NULL DEFAULT 'MESA',
ALTER COLUMN "mesa_pedido" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Pedido_tipo_pedido_idx" ON "Pedido"("tipo_pedido");

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_mesa_pedido_fkey" FOREIGN KEY ("mesa_pedido") REFERENCES "Mesa"("id_mesa") ON DELETE SET NULL ON UPDATE CASCADE;
