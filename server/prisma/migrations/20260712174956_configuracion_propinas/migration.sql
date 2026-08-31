-- CreateTable
-- Retención del restaurante sobre las propinas (sección de reparto de nómina).
CREATE TABLE "ConfiguracionPropinas" (
    "id_configuracionPropinas" SERIAL NOT NULL,
    "retiene_casa" BOOLEAN NOT NULL DEFAULT false,
    "porcentaje_casa" DECIMAL(5,2),
    "configuracion_activa" BOOLEAN NOT NULL DEFAULT true,
    "fecha_creacion_configuracionPropinas" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfiguracionPropinas_pkey" PRIMARY KEY ("id_configuracionPropinas")
);

-- A lo sumo UNA configuracion activa a la vez (mismo patron que
-- configuracion_nomina_activa_unica; no expresable en schema.prisma).
CREATE UNIQUE INDEX "configuracion_propinas_activa_unica"
  ON "ConfiguracionPropinas" ("configuracion_activa")
  WHERE "configuracion_activa" = true;
