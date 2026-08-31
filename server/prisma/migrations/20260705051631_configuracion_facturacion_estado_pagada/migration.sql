-- AlterEnum
-- Falta detectada del modelado inicial: la spec exige "marcar Factura como
-- pagada" (seccion 6) y Pedido->PAGADO depende de que todas las subcuentas
-- tengan factura pagada, pero el enum solo tenia EMITIDA/ANULADA.
ALTER TYPE "EstadoFactura" ADD VALUE 'PAGADA';

-- CreateTable
CREATE TABLE "ConfiguracionFacturacion" (
    "id_configuracionFacturacion" SERIAL NOT NULL,
    "porcentaje_servicio" DECIMAL(5,2) NOT NULL,
    "porcentaje_impuestos" DECIMAL(5,2) NOT NULL,
    "configuracion_activa" BOOLEAN NOT NULL DEFAULT true,
    "fecha_creacion_configuracionFacturacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfiguracionFacturacion_pkey" PRIMARY KEY ("id_configuracionFacturacion")
);

-- A lo sumo UNA configuracion activa a la vez (mismo patron que el indice
-- parcial receta_activa_por_producto; no expresable en schema.prisma).
CREATE UNIQUE INDEX "configuracion_facturacion_activa_unica"
  ON "ConfiguracionFacturacion" ("configuracion_activa")
  WHERE "configuracion_activa" = true;
