-- Datos del negocio para el encabezado de la factura del cliente. Versionada
-- (a lo sumo una activa) igual que ConfiguracionFacturacion/ConfiguracionPropinas.

-- CreateTable
CREATE TABLE "ConfiguracionNegocio" (
    "id_configuracionNegocio" SERIAL NOT NULL,
    "nombre_negocio" VARCHAR(80) NOT NULL,
    "nit_negocio" VARCHAR(30),
    "direccion_negocio" VARCHAR(120),
    "telefono_negocio" VARCHAR(30),
    "configuracion_activa" BOOLEAN NOT NULL DEFAULT true,
    "fecha_creacion_configuracionNegocio" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfiguracionNegocio_pkey" PRIMARY KEY ("id_configuracionNegocio")
);

-- A lo sumo UNA configuracion activa a la vez (mismo patron que
-- configuracion_facturacion/propinas_activa_unica; no expresable en schema.prisma).
CREATE UNIQUE INDEX "configuracion_negocio_activa_unica"
  ON "ConfiguracionNegocio" ("configuracion_activa")
  WHERE "configuracion_activa" = true;
