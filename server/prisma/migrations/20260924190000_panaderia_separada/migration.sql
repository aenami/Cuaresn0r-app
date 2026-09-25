-- Los datos existentes pertenecen al restaurante. La panaderia abre su propia
-- caja y tiene existencias, ventas y conteos independientes.
CREATE TYPE "AreaNegocio" AS ENUM ('RESTAURANTE', 'PANADERIA');
CREATE TYPE "TipoArticuloPanaderia" AS ENUM ('PANADERIA', 'EXTERNO', 'INSUMO');
ALTER TYPE "TipoMovimientoInventario" ADD VALUE 'TRANSFERENCIA';
CREATE TYPE "TipoMovimientoPanaderia" AS ENUM
  ('PRODUCCION', 'RECEPCION', 'VENTA', 'TRANSFERENCIA', 'MERMA', 'AJUSTE_CONTEO');

ALTER TABLE "Caja" ADD COLUMN "area" "AreaNegocio" NOT NULL DEFAULT 'RESTAURANTE';
ALTER TABLE "Usuario" ADD COLUMN "area" "AreaNegocio" NOT NULL DEFAULT 'RESTAURANTE';
ALTER TABLE "Turno" ADD COLUMN "conteo_panaderia_cierre_turno" JSONB;

CREATE TABLE "ArticuloPanaderia" (
  "id" SERIAL PRIMARY KEY,
  "nombre" VARCHAR(80) NOT NULL,
  "tipo" "TipoArticuloPanaderia" NOT NULL,
  "unidad" "UnidadIngrediente" NOT NULL DEFAULT 'UNIDADES',
  "precioVenta" DECIMAL(20,4) NOT NULL,
  "existencia" DECIMAL(20,4) NOT NULL DEFAULT 0,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "fechaCreacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArticuloPanaderia_precio_nonnegative" CHECK ("precioVenta" >= 0),
  CONSTRAINT "ArticuloPanaderia_existencia_nonnegative" CHECK ("existencia" >= 0)
);

CREATE TABLE "VentaPanaderia" (
  "id" SERIAL PRIMARY KEY,
  "claveOperacion" VARCHAR(50) NOT NULL UNIQUE,
  "turnoId" INTEGER NOT NULL REFERENCES "Turno"("id_turno") ON DELETE RESTRICT ON UPDATE CASCADE,
  "fecha" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "total" DECIMAL(20,4) NOT NULL,
  "concepto" VARCHAR(150),
  CONSTRAINT "VentaPanaderia_total_positive" CHECK ("total" > 0)
);
CREATE INDEX "VentaPanaderia_turnoId_fecha_idx" ON "VentaPanaderia"("turnoId", "fecha");

CREATE TABLE "DetalleVentaPanaderia" (
  "id" SERIAL PRIMARY KEY,
  "ventaId" INTEGER NOT NULL REFERENCES "VentaPanaderia"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "articuloId" INTEGER NOT NULL REFERENCES "ArticuloPanaderia"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "cantidad" DECIMAL(20,4) NOT NULL,
  "precioUnitario" DECIMAL(20,4) NOT NULL,
  "subtotal" DECIMAL(20,4) NOT NULL,
  "nombreSnapshot" VARCHAR(80) NOT NULL,
  CONSTRAINT "DetalleVentaPanaderia_cantidad_positive" CHECK ("cantidad" > 0)
);
CREATE INDEX "DetalleVentaPanaderia_articuloId_idx" ON "DetalleVentaPanaderia"("articuloId");

CREATE TABLE "PagoVentaPanaderia" (
  "id" SERIAL PRIMARY KEY,
  "ventaId" INTEGER NOT NULL REFERENCES "VentaPanaderia"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "metodo" "MetodoPago" NOT NULL,
  "monto" DECIMAL(20,4) NOT NULL,
  CONSTRAINT "PagoVentaPanaderia_monto_positive" CHECK ("monto" > 0)
);
CREATE INDEX "PagoVentaPanaderia_ventaId_idx" ON "PagoVentaPanaderia"("ventaId");

CREATE TABLE "ConteoPanaderia" (
  "id" SERIAL PRIMARY KEY,
  "fecha" DATE NOT NULL,
  "articuloId" INTEGER NOT NULL REFERENCES "ArticuloPanaderia"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "usuarioId" INTEGER NOT NULL REFERENCES "Usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE,
  "cantidadInicial" DECIMAL(20,4) NOT NULL,
  "entradas" DECIMAL(20,4) NOT NULL,
  "ventasRegistradas" DECIMAL(20,4) NOT NULL,
  "transferencias" DECIMAL(20,4) NOT NULL,
  "mermas" DECIMAL(20,4) NOT NULL,
  "cantidadFisica" DECIMAL(20,4) NOT NULL,
  "precioReferencia" DECIMAL(20,4) NOT NULL,
  "fechaRegistro" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConteoPanaderia_fisica_nonnegative" CHECK ("cantidadFisica" >= 0)
);
CREATE UNIQUE INDEX "ConteoPanaderia_fecha_articuloId_key" ON "ConteoPanaderia"("fecha", "articuloId");
CREATE INDEX "ConteoPanaderia_articuloId_fecha_idx" ON "ConteoPanaderia"("articuloId", "fecha");

CREATE TABLE "TransferenciaPanaderia" (
  "id" SERIAL PRIMARY KEY,
  "claveOperacion" VARCHAR(50) NOT NULL UNIQUE,
  "articuloId" INTEGER NOT NULL REFERENCES "ArticuloPanaderia"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "cuentaPorPagarId" INTEGER UNIQUE REFERENCES "CuentaPorPagar"("id_cuentaPorPagar") ON DELETE SET NULL ON UPDATE CASCADE,
  "cantidad" DECIMAL(20,4) NOT NULL,
  "precioUnitario" DECIMAL(20,4) NOT NULL,
  "montoTotal" DECIMAL(20,4) NOT NULL,
  "productoDestinoId" INTEGER REFERENCES "Producto"("id_producto") ON DELETE SET NULL ON UPDATE CASCADE,
  "ingredienteDestinoId" INTEGER REFERENCES "Ingrediente"("id_ingrediente") ON DELETE SET NULL ON UPDATE CASCADE,
  "concepto" VARCHAR(150) NOT NULL,
  "fechaSalida" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fechaRecepcion" TIMESTAMP(6),
  "fechaPago" TIMESTAMP(6),
  CONSTRAINT "TransferenciaPanaderia_destino_exclusivo" CHECK
    (("productoDestinoId" IS NOT NULL) <> ("ingredienteDestinoId" IS NOT NULL)),
  CONSTRAINT "TransferenciaPanaderia_cantidad_positive" CHECK ("cantidad" > 0),
  CONSTRAINT "TransferenciaPanaderia_precio_nonnegative" CHECK ("precioUnitario" >= 0)
);
CREATE INDEX "TransferenciaPanaderia_articuloId_fechaSalida_idx" ON "TransferenciaPanaderia"("articuloId", "fechaSalida");
CREATE INDEX "TransferenciaPanaderia_productoDestinoId_idx" ON "TransferenciaPanaderia"("productoDestinoId");
CREATE INDEX "TransferenciaPanaderia_ingredienteDestinoId_idx" ON "TransferenciaPanaderia"("ingredienteDestinoId");

CREATE TABLE "PagoTransferenciaPanaderia" (
  "id" SERIAL PRIMARY KEY,
  "transferenciaId" INTEGER NOT NULL REFERENCES "TransferenciaPanaderia"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "turnoId" INTEGER NOT NULL REFERENCES "Turno"("id_turno") ON DELETE RESTRICT ON UPDATE CASCADE,
  "pagoCuentaPorPagarId" INTEGER NOT NULL UNIQUE REFERENCES "PagoCuentaPorPagar"("id_pagoCuentaPorPagar") ON DELETE RESTRICT ON UPDATE CASCADE,
  "metodo" "MetodoPago" NOT NULL,
  "monto" DECIMAL(20,4) NOT NULL,
  "concepto" VARCHAR(150) NOT NULL,
  "fecha" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PagoTransferenciaPanaderia_monto_positive" CHECK ("monto" > 0)
);
CREATE INDEX "PagoTransferenciaPanaderia_transferenciaId_idx" ON "PagoTransferenciaPanaderia"("transferenciaId");
CREATE INDEX "PagoTransferenciaPanaderia_turnoId_idx" ON "PagoTransferenciaPanaderia"("turnoId");

CREATE TABLE "MovimientoPanaderia" (
  "id" SERIAL PRIMARY KEY,
  "articuloId" INTEGER NOT NULL REFERENCES "ArticuloPanaderia"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "usuarioId" INTEGER NOT NULL REFERENCES "Usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE,
  "tipo" "TipoMovimientoPanaderia" NOT NULL,
  "cantidad" DECIMAL(20,4) NOT NULL,
  "existenciaAntes" DECIMAL(20,4) NOT NULL,
  "existenciaDespues" DECIMAL(20,4) NOT NULL,
  "concepto" VARCHAR(200),
  "ventaId" INTEGER REFERENCES "VentaPanaderia"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "transferenciaId" INTEGER REFERENCES "TransferenciaPanaderia"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "fecha" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MovimientoPanaderia_cantidad_positive" CHECK ("cantidad" > 0)
);
CREATE INDEX "MovimientoPanaderia_articuloId_fecha_idx" ON "MovimientoPanaderia"("articuloId", "fecha");
CREATE INDEX "MovimientoPanaderia_ventaId_idx" ON "MovimientoPanaderia"("ventaId");
CREATE INDEX "MovimientoPanaderia_transferenciaId_idx" ON "MovimientoPanaderia"("transferenciaId");

CREATE TABLE "TransferenciaRestaurantePanaderia" (
  "id" SERIAL PRIMARY KEY,
  "claveOperacion" VARCHAR(50) NOT NULL UNIQUE,
  "ingredienteId" INTEGER NOT NULL REFERENCES "Ingrediente"("id_ingrediente") ON DELETE RESTRICT ON UPDATE CASCADE,
  "articuloDestinoId" INTEGER NOT NULL REFERENCES "ArticuloPanaderia"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "cantidad" DECIMAL(20,4) NOT NULL,
  "precioUnitario" DECIMAL(20,4) NOT NULL,
  "montoTotal" DECIMAL(20,4) NOT NULL,
  "concepto" VARCHAR(150) NOT NULL,
  "fechaSalida" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "usuarioSalidaId" INTEGER NOT NULL REFERENCES "Usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE,
  "fechaRecepcion" TIMESTAMP(6),
  "usuarioRecibeId" INTEGER REFERENCES "Usuario"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE,
  "fechaPago" TIMESTAMP(6),
  "usuarioPagoId" INTEGER REFERENCES "Usuario"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE,
  "turnoPagoId" INTEGER REFERENCES "Turno"("id_turno") ON DELETE SET NULL ON UPDATE CASCADE,
  "metodoPago" "MetodoPago",
  "fechaConfirmacionIngreso" TIMESTAMP(6),
  "usuarioConfirmaId" INTEGER REFERENCES "Usuario"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE,
  "turnoIngresoId" INTEGER REFERENCES "Turno"("id_turno") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "TransferenciaRestaurante_cantidad_positive" CHECK ("cantidad" > 0),
  CONSTRAINT "TransferenciaRestaurante_precio_positive" CHECK ("precioUnitario" > 0),
  CONSTRAINT "TransferenciaRestaurante_monto_positive" CHECK ("montoTotal" > 0)
);
CREATE INDEX "TransferenciaRestaurante_ingrediente_fecha_idx" ON "TransferenciaRestaurantePanaderia"("ingredienteId", "fechaSalida");
CREATE INDEX "TransferenciaRestaurante_articulo_idx" ON "TransferenciaRestaurantePanaderia"("articuloDestinoId");
CREATE INDEX "TransferenciaRestaurante_turnoPago_idx" ON "TransferenciaRestaurantePanaderia"("turnoPagoId");
CREATE INDEX "TransferenciaRestaurante_turnoIngreso_idx" ON "TransferenciaRestaurantePanaderia"("turnoIngresoId");

ALTER TABLE "MovimientoPanaderia" ADD COLUMN "transferenciaRestauranteId" INTEGER REFERENCES "TransferenciaRestaurantePanaderia"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "MovimientoPanaderia_transferenciaRestauranteId_idx" ON "MovimientoPanaderia"("transferenciaRestauranteId");
