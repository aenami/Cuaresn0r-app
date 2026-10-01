CREATE TYPE "EstadoHojaProduccionPanaderia" AS ENUM ('BORRADOR', 'FINALIZADA');

CREATE TABLE "HojaProduccionPanaderia" (
    "id" SERIAL NOT NULL,
    "fecha" DATE NOT NULL,
    "panaderoId" INTEGER NOT NULL,
    "estado" "EstadoHojaProduccionPanaderia" NOT NULL DEFAULT 'BORRADOR',
    "fechaCreacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaFinalizacion" TIMESTAMP(6),
    CONSTRAINT "HojaProduccionPanaderia_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "HojaProduccionPanaderia_estado_fecha_check" CHECK (
        ("estado" = 'BORRADOR' AND "fechaFinalizacion" IS NULL) OR
        ("estado" = 'FINALIZADA' AND "fechaFinalizacion" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "HojaProduccionPanaderia_fecha_panaderoId_key" ON "HojaProduccionPanaderia"("fecha", "panaderoId");
CREATE INDEX "HojaProduccionPanaderia_fecha_estado_idx" ON "HojaProduccionPanaderia"("fecha", "estado");
ALTER TABLE "HojaProduccionPanaderia" ADD CONSTRAINT "HojaProduccionPanaderia_panaderoId_fkey" FOREIGN KEY ("panaderoId") REFERENCES "Usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "EntradaHojaProduccion" (
    "id" SERIAL NOT NULL,
    "hojaId" INTEGER NOT NULL,
    "articuloId" INTEGER NOT NULL,
    "movimientoId" INTEGER NOT NULL,
    "claveOperacion" VARCHAR(50) NOT NULL,
    "nombreArticuloSnapshot" VARCHAR(80) NOT NULL,
    "tipoSnapshot" "TipoArticuloPanaderia" NOT NULL,
    "cantidad" DECIMAL(20,4) NOT NULL,
    "precioUnitarioSnapshot" DECIMAL(20,4) NOT NULL,
    "subtotal" DECIMAL(20,4) NOT NULL,
    "fechaRegistro" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EntradaHojaProduccion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EntradaHojaProduccion_cantidad_check" CHECK ("cantidad" > 0 AND "cantidad" = trunc("cantidad")),
    CONSTRAINT "EntradaHojaProduccion_precio_check" CHECK ("precioUnitarioSnapshot" >= 0 AND "subtotal" >= 0),
    CONSTRAINT "EntradaHojaProduccion_tipo_check" CHECK ("tipoSnapshot" IN ('PANADERIA', 'PASTELERIA'))
);

CREATE UNIQUE INDEX "EntradaHojaProduccion_movimientoId_key" ON "EntradaHojaProduccion"("movimientoId");
CREATE UNIQUE INDEX "EntradaHojaProduccion_claveOperacion_key" ON "EntradaHojaProduccion"("claveOperacion");
CREATE INDEX "EntradaHojaProduccion_hojaId_fechaRegistro_idx" ON "EntradaHojaProduccion"("hojaId", "fechaRegistro");
CREATE INDEX "EntradaHojaProduccion_articuloId_fechaRegistro_idx" ON "EntradaHojaProduccion"("articuloId", "fechaRegistro");
ALTER TABLE "EntradaHojaProduccion" ADD CONSTRAINT "EntradaHojaProduccion_hojaId_fkey" FOREIGN KEY ("hojaId") REFERENCES "HojaProduccionPanaderia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EntradaHojaProduccion" ADD CONSTRAINT "EntradaHojaProduccion_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "ArticuloPanaderia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EntradaHojaProduccion" ADD CONSTRAINT "EntradaHojaProduccion_movimientoId_fkey" FOREIGN KEY ("movimientoId") REFERENCES "MovimientoPanaderia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "MetaProduccionPanaderia" (
    "id" SERIAL NOT NULL,
    "fecha" DATE NOT NULL,
    "articuloId" INTEGER NOT NULL,
    "nombreSnapshot" VARCHAR(80) NOT NULL,
    "tipoSnapshot" "TipoArticuloPanaderia" NOT NULL,
    "cantidadObjetivo" INTEGER NOT NULL,
    "estado" "EstadoMetaProduccion" NOT NULL DEFAULT 'PENDIENTE',
    "usuarioCreaId" INTEGER NOT NULL,
    "usuarioResuelveId" INTEGER,
    "fechaCreacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaResolucion" TIMESTAMP(6),
    CONSTRAINT "MetaProduccionPanaderia_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MetaProduccionPanaderia_cantidad_check" CHECK ("cantidadObjetivo" > 0),
    CONSTRAINT "MetaProduccionPanaderia_tipo_check" CHECK ("tipoSnapshot" IN ('PANADERIA', 'PASTELERIA'))
);

CREATE UNIQUE INDEX "MetaProduccionPanaderia_fecha_articuloId_key" ON "MetaProduccionPanaderia"("fecha", "articuloId");
CREATE INDEX "MetaProduccionPanaderia_fecha_estado_idx" ON "MetaProduccionPanaderia"("fecha", "estado");
ALTER TABLE "MetaProduccionPanaderia" ADD CONSTRAINT "MetaProduccionPanaderia_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "ArticuloPanaderia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MetaProduccionPanaderia" ADD CONSTRAINT "MetaProduccionPanaderia_usuarioCreaId_fkey" FOREIGN KEY ("usuarioCreaId") REFERENCES "Usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MetaProduccionPanaderia" ADD CONSTRAINT "MetaProduccionPanaderia_usuarioResuelveId_fkey" FOREIGN KEY ("usuarioResuelveId") REFERENCES "Usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
