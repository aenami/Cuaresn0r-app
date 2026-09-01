-- Reestructura para el restaurante: fichas, pedidos sin mesa, comandas
-- borrador, facturacion por producto, cuentas por pagar e impresion USB.
--
-- La migracion evita ADD VALUE para enums que se usan en defaults dentro de
-- la misma transaccion. Recrear el tipo es seguro y permite transformar los
-- valores historicos (PAGADO -> CERRADO, MESA -> LOCAL) sin perder pedidos.

-- Prisma no envuelve automaticamente las migraciones de PostgreSQL en una
-- transaccion. Esta reestructuracion debe aplicarse completa o no aplicarse.
BEGIN;

-- -------------------------------------------------------------------------
-- Enums existentes
-- -------------------------------------------------------------------------
ALTER TABLE "Pedido" ALTER COLUMN "estado_pedido" DROP DEFAULT;
ALTER TYPE "EstadoPedido" RENAME TO "EstadoPedido_anterior";
CREATE TYPE "EstadoPedido" AS ENUM ('ABIERTO', 'EN_PREPARACION', 'ENTREGADO', 'CERRADO', 'CANCELADO');
ALTER TABLE "Pedido"
  ALTER COLUMN "estado_pedido" TYPE "EstadoPedido"
  USING (
    CASE "estado_pedido"::text
      WHEN 'PAGADO' THEN 'CERRADO'
      ELSE "estado_pedido"::text
    END
  )::"EstadoPedido";
DROP TYPE "EstadoPedido_anterior";
ALTER TABLE "Pedido" ALTER COLUMN "estado_pedido" SET DEFAULT 'ABIERTO';

ALTER TABLE "Pedido" ALTER COLUMN "tipo_pedido" DROP DEFAULT;
ALTER TYPE "TipoPedido" RENAME TO "TipoPedido_anterior";
CREATE TYPE "TipoPedido" AS ENUM ('LOCAL', 'DOMICILIO');
ALTER TABLE "Pedido"
  ALTER COLUMN "tipo_pedido" TYPE "TipoPedido"
  USING (
    CASE "tipo_pedido"::text
      WHEN 'MESA' THEN 'LOCAL'
      ELSE "tipo_pedido"::text
    END
  )::"TipoPedido";
DROP TYPE "TipoPedido_anterior";
ALTER TABLE "Pedido" ALTER COLUMN "tipo_pedido" SET DEFAULT 'LOCAL';

ALTER TABLE "DetalleComanda" ALTER COLUMN "estado_dc" DROP DEFAULT;
ALTER TYPE "EstadoDetalleComanda" RENAME TO "EstadoDetalleComanda_anterior";
CREATE TYPE "EstadoDetalleComanda" AS ENUM ('PENDIENTE', 'PREPARANDO', 'ENTREGADO', 'CANCELADO');
ALTER TABLE "DetalleComanda"
  ALTER COLUMN "estado_dc" TYPE "EstadoDetalleComanda"
  USING "estado_dc"::text::"EstadoDetalleComanda";
DROP TYPE "EstadoDetalleComanda_anterior";
ALTER TABLE "DetalleComanda" ALTER COLUMN "estado_dc" SET DEFAULT 'PENDIENTE';

ALTER TABLE "ImpresionComanda" ALTER COLUMN "estado_impresion" DROP DEFAULT;
ALTER TYPE "EstadoImpresion" RENAME TO "EstadoImpresion_anterior";
CREATE TYPE "EstadoImpresion" AS ENUM ('PENDIENTE', 'EN_PROCESO', 'REINTENTO', 'IMPRESA', 'FALLIDA');
ALTER TABLE "ImpresionComanda"
  ALTER COLUMN "estado_impresion" TYPE "EstadoImpresion"
  USING "estado_impresion"::text::"EstadoImpresion";
DROP TYPE "EstadoImpresion_anterior";
ALTER TABLE "ImpresionComanda" ALTER COLUMN "estado_impresion" SET DEFAULT 'PENDIENTE';

-- -------------------------------------------------------------------------
-- Pedidos y fichas
-- -------------------------------------------------------------------------
CREATE TYPE "EstadoComanda" AS ENUM ('BORRADOR', 'ENVIADA');

CREATE TABLE "Ficha" (
  "id_ficha" SERIAL NOT NULL,
  "numero_ficha" VARCHAR(10) NOT NULL,
  "ficha_activa" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "Ficha_pkey" PRIMARY KEY ("id_ficha")
);
CREATE UNIQUE INDEX "Ficha_numero_ficha_key" ON "Ficha"("numero_ficha");

ALTER TABLE "Pedido" DROP CONSTRAINT "Pedido_mesa_pedido_fkey";
DROP INDEX "Pedido_mesa_pedido_idx";
ALTER TABLE "Pedido"
  DROP COLUMN "mesa_pedido",
  ADD COLUMN "id_ficha_pedido" INTEGER,
  ADD COLUMN "fecha_cierre_pedido" TIMESTAMP(6);
CREATE INDEX "Pedido_id_ficha_pedido_idx" ON "Pedido"("id_ficha_pedido");
ALTER TABLE "Pedido"
  ADD CONSTRAINT "Pedido_id_ficha_pedido_fkey"
  FOREIGN KEY ("id_ficha_pedido") REFERENCES "Ficha"("id_ficha")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Una ficha solo puede estar asignada a un pedido que no haya terminado.
CREATE UNIQUE INDEX "pedido_ficha_activa_unica"
  ON "Pedido" ("id_ficha_pedido")
  WHERE "id_ficha_pedido" IS NOT NULL
    AND "estado_pedido" NOT IN ('CERRADO', 'CANCELADO');

ALTER TABLE "Comanda"
  ADD COLUMN "estado_comanda" "EstadoComanda",
  ADD COLUMN "fecha_envio_comanda" TIMESTAMP(6),
  ADD COLUMN "id_usuario_envia_comanda" INTEGER,
  ADD COLUMN "autorizada_sin_pago" BOOLEAN NOT NULL DEFAULT false;
-- Las comandas historicas ya habian sido enviadas al crearse.
UPDATE "Comanda" SET "estado_comanda" = 'ENVIADA', "fecha_envio_comanda" = "creacion_comanda";
ALTER TABLE "Comanda"
  ALTER COLUMN "estado_comanda" SET NOT NULL,
  ALTER COLUMN "estado_comanda" SET DEFAULT 'BORRADOR';
CREATE INDEX "Comanda_estado_comanda_idx" ON "Comanda"("estado_comanda");
CREATE INDEX "Comanda_id_usuario_envia_comanda_idx" ON "Comanda"("id_usuario_envia_comanda");
ALTER TABLE "Comanda"
  ADD CONSTRAINT "Comanda_id_usuario_envia_comanda_fkey"
  FOREIGN KEY ("id_usuario_envia_comanda") REFERENCES "Usuario"("id_usuario")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- -------------------------------------------------------------------------
-- Facturacion exacta y comentarios de cuenta
-- -------------------------------------------------------------------------
CREATE TABLE "FacturaDetalle" (
  "id_facturaDetalle" SERIAL NOT NULL,
  "id_factura_fd" INTEGER NOT NULL,
  "id_detalleComanda_fd" INTEGER NOT NULL,
  "proporcion_facturada_fd" DECIMAL(5,4) NOT NULL DEFAULT 1,
  "subtotal_facturado_fd" DECIMAL(20,4) NOT NULL,
  CONSTRAINT "FacturaDetalle_pkey" PRIMARY KEY ("id_facturaDetalle")
);
CREATE UNIQUE INDEX "FacturaDetalle_id_factura_fd_id_detalleComanda_fd_key"
  ON "FacturaDetalle"("id_factura_fd", "id_detalleComanda_fd");
CREATE INDEX "FacturaDetalle_id_factura_fd_idx" ON "FacturaDetalle"("id_factura_fd");
CREATE INDEX "FacturaDetalle_id_detalleComanda_fd_idx" ON "FacturaDetalle"("id_detalleComanda_fd");
ALTER TABLE "FacturaDetalle"
  ADD CONSTRAINT "FacturaDetalle_id_factura_fd_fkey"
  FOREIGN KEY ("id_factura_fd") REFERENCES "Factura"("id_factura")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FacturaDetalle_id_detalleComanda_fd_fkey"
  FOREIGN KEY ("id_detalleComanda_fd") REFERENCES "DetalleComanda"("id_detalleComanda")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Las facturas previas cubrian toda la subcuenta. Se conserva esa cobertura
-- para que el nuevo flujo no vuelva a facturar productos historicos.
INSERT INTO "FacturaDetalle" (
  "id_factura_fd", "id_detalleComanda_fd", "proporcion_facturada_fd", "subtotal_facturado_fd"
)
SELECT
  f."id_factura",
  dc."id_detalleComanda",
  1,
  dc."cantidad_producto_dc" * dc."precio_unitario_dc"
FROM "Factura" f
JOIN "DetalleComanda" dc ON dc."id_subcuenta_dc" = f."id_subcuenta_factura"
WHERE f."estado_factura" <> 'ANULADA'
  AND dc."estado_dc" <> 'CANCELADO'
UNION ALL
SELECT
  f."id_factura",
  reparto."id_detalleComanda_sdc",
  reparto."proporcion_sdc",
  dc."cantidad_producto_dc" * dc."precio_unitario_dc" * reparto."proporcion_sdc"
FROM "Factura" f
JOIN "SubcuentaDetalleComanda" reparto ON reparto."id_subcuenta_sdc" = f."id_subcuenta_factura"
JOIN "DetalleComanda" dc ON dc."id_detalleComanda" = reparto."id_detalleComanda_sdc"
WHERE f."estado_factura" <> 'ANULADA'
  AND dc."estado_dc" <> 'CANCELADO';

CREATE TABLE "ComentarioCuenta" (
  "id_comentarioCuenta" SERIAL NOT NULL,
  "id_subcuenta_comentarioCuenta" INTEGER NOT NULL,
  "id_usuario_comentarioCuenta" INTEGER NOT NULL,
  "texto_comentarioCuenta" VARCHAR(300) NOT NULL,
  "fecha_comentarioCuenta" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "comentario_resuelto" BOOLEAN NOT NULL DEFAULT false,
  "id_usuario_resuelve_comentario" INTEGER,
  "fecha_resolucion_comentario" TIMESTAMP(6),
  CONSTRAINT "ComentarioCuenta_pkey" PRIMARY KEY ("id_comentarioCuenta")
);
CREATE INDEX "ComentarioCuenta_id_subcuenta_comentarioCuenta_idx" ON "ComentarioCuenta"("id_subcuenta_comentarioCuenta");
CREATE INDEX "ComentarioCuenta_id_usuario_comentarioCuenta_idx" ON "ComentarioCuenta"("id_usuario_comentarioCuenta");
CREATE INDEX "ComentarioCuenta_comentario_resuelto_idx" ON "ComentarioCuenta"("comentario_resuelto");
ALTER TABLE "ComentarioCuenta"
  ADD CONSTRAINT "ComentarioCuenta_id_subcuenta_comentarioCuenta_fkey"
  FOREIGN KEY ("id_subcuenta_comentarioCuenta") REFERENCES "Subcuenta"("id_subcuenta")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ComentarioCuenta_id_usuario_comentarioCuenta_fkey"
  FOREIGN KEY ("id_usuario_comentarioCuenta") REFERENCES "Usuario"("id_usuario")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ComentarioCuenta_id_usuario_resuelve_comentario_fkey"
  FOREIGN KEY ("id_usuario_resuelve_comentario") REFERENCES "Usuario"("id_usuario")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- -------------------------------------------------------------------------
-- Inventario y cuentas por pagar
-- -------------------------------------------------------------------------
CREATE TYPE "EstadoCuentaPorPagar" AS ENUM ('PENDIENTE', 'PARCIAL', 'PAGADA', 'ANULADA');
CREATE TYPE "MetodoPagoCuentaPorPagar" AS ENUM ('EFECTIVO', 'TRANSFERENCIA');

ALTER TABLE "Ingrediente"
  ADD COLUMN "umbral_bajo_ingrediente" DECIMAL(20,4),
  ADD COLUMN "umbral_alto_ingrediente" DECIMAL(20,4);

-- Algunas instalaciones del template ya tienen Proveedor por el modulo de
-- compras heredado. Se reutiliza esa tabla y se conserva toda su informacion.
DO $$
BEGIN
  IF to_regclass('public."Proveedor"') IS NULL THEN
    CREATE TABLE "Proveedor" (
      "id_proveedor" SERIAL NOT NULL,
      "nombre_proveedor" VARCHAR(80) NOT NULL,
      "contacto_proveedor" VARCHAR(80),
      "telefono_proveedor" VARCHAR(30),
      "nit_proveedor" VARCHAR(30),
      "proveedor_activo" BOOLEAN NOT NULL DEFAULT true,
      CONSTRAINT "Proveedor_pkey" PRIMARY KEY ("id_proveedor")
    );
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Proveedor'
      AND column_name = 'activo_proveedor'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Proveedor'
      AND column_name = 'proveedor_activo'
  ) THEN
    ALTER TABLE "Proveedor"
      RENAME COLUMN "activo_proveedor" TO "proveedor_activo";
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "Proveedor_nombre_proveedor_key"
  ON "Proveedor"("nombre_proveedor");

CREATE TABLE "CuentaPorPagar" (
  "id_cuentaPorPagar" SERIAL NOT NULL,
  "id_proveedor_cuentaPorPagar" INTEGER NOT NULL,
  "concepto_cuentaPorPagar" VARCHAR(150) NOT NULL,
  "documento_cuentaPorPagar" VARCHAR(50),
  "fecha_emision_cuentaPorPagar" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fecha_vencimiento_cuentaPorPagar" DATE,
  "monto_total_cuentaPorPagar" DECIMAL(20,4) NOT NULL,
  "estado_cuentaPorPagar" "EstadoCuentaPorPagar" NOT NULL DEFAULT 'PENDIENTE',
  "observacion_cuentaPorPagar" VARCHAR(300),
  "fecha_recepcion_mercancia" TIMESTAMP(6),
  "id_usuario_recibe_mercancia" INTEGER,
  CONSTRAINT "CuentaPorPagar_pkey" PRIMARY KEY ("id_cuentaPorPagar")
);
CREATE INDEX "CuentaPorPagar_id_proveedor_cuentaPorPagar_idx" ON "CuentaPorPagar"("id_proveedor_cuentaPorPagar");
CREATE INDEX "CuentaPorPagar_estado_cuentaPorPagar_idx" ON "CuentaPorPagar"("estado_cuentaPorPagar");
CREATE INDEX "CuentaPorPagar_fecha_vencimiento_cuentaPorPagar_idx" ON "CuentaPorPagar"("fecha_vencimiento_cuentaPorPagar");
ALTER TABLE "CuentaPorPagar"
  ADD CONSTRAINT "CuentaPorPagar_id_proveedor_cuentaPorPagar_fkey"
  FOREIGN KEY ("id_proveedor_cuentaPorPagar") REFERENCES "Proveedor"("id_proveedor")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CuentaPorPagar_id_usuario_recibe_mercancia_fkey"
  FOREIGN KEY ("id_usuario_recibe_mercancia") REFERENCES "Usuario"("id_usuario")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "DetalleCuentaPorPagar" (
  "id_detalleCuentaPorPagar" SERIAL NOT NULL,
  "id_cuentaPorPagar_detalle" INTEGER NOT NULL,
  "id_ingrediente_detalleCuenta" INTEGER NOT NULL,
  "cantidad_detalleCuenta" DECIMAL(20,4) NOT NULL,
  "precio_unitario_detalleCuenta" DECIMAL(20,4) NOT NULL,
  CONSTRAINT "DetalleCuentaPorPagar_pkey" PRIMARY KEY ("id_detalleCuentaPorPagar")
);
CREATE UNIQUE INDEX "DetalleCuentaPorPagar_id_cuentaPorPagar_detalle_id_ingrediente_detalleCuenta_key"
  ON "DetalleCuentaPorPagar"("id_cuentaPorPagar_detalle", "id_ingrediente_detalleCuenta");
CREATE INDEX "DetalleCuentaPorPagar_id_ingrediente_detalleCuenta_idx" ON "DetalleCuentaPorPagar"("id_ingrediente_detalleCuenta");
ALTER TABLE "DetalleCuentaPorPagar"
  ADD CONSTRAINT "DetalleCuentaPorPagar_id_cuentaPorPagar_detalle_fkey"
  FOREIGN KEY ("id_cuentaPorPagar_detalle") REFERENCES "CuentaPorPagar"("id_cuentaPorPagar")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DetalleCuentaPorPagar_id_ingrediente_detalleCuenta_fkey"
  FOREIGN KEY ("id_ingrediente_detalleCuenta") REFERENCES "Ingrediente"("id_ingrediente")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PagoCuentaPorPagar" (
  "id_pagoCuentaPorPagar" SERIAL NOT NULL,
  "id_cuentaPorPagar_pago" INTEGER NOT NULL,
  "id_turno_pagoCuentaPorPagar" INTEGER,
  "id_usuario_pagoCuentaPorPagar" INTEGER NOT NULL,
  "metodo_pagoCuentaPorPagar" "MetodoPagoCuentaPorPagar" NOT NULL,
  "monto_pagoCuentaPorPagar" DECIMAL(20,4) NOT NULL,
  "fecha_pagoCuentaPorPagar" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PagoCuentaPorPagar_pkey" PRIMARY KEY ("id_pagoCuentaPorPagar")
);
CREATE INDEX "PagoCuentaPorPagar_id_cuentaPorPagar_pago_idx" ON "PagoCuentaPorPagar"("id_cuentaPorPagar_pago");
CREATE INDEX "PagoCuentaPorPagar_id_turno_pagoCuentaPorPagar_idx" ON "PagoCuentaPorPagar"("id_turno_pagoCuentaPorPagar");
CREATE INDEX "PagoCuentaPorPagar_id_usuario_pagoCuentaPorPagar_idx" ON "PagoCuentaPorPagar"("id_usuario_pagoCuentaPorPagar");
ALTER TABLE "PagoCuentaPorPagar"
  ADD CONSTRAINT "PagoCuentaPorPagar_id_cuentaPorPagar_pago_fkey"
  FOREIGN KEY ("id_cuentaPorPagar_pago") REFERENCES "CuentaPorPagar"("id_cuentaPorPagar")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PagoCuentaPorPagar_id_turno_pagoCuentaPorPagar_fkey"
  FOREIGN KEY ("id_turno_pagoCuentaPorPagar") REFERENCES "Turno"("id_turno")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "PagoCuentaPorPagar_id_usuario_pagoCuentaPorPagar_fkey"
  FOREIGN KEY ("id_usuario_pagoCuentaPorPagar") REFERENCES "Usuario"("id_usuario")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MovimientoInventario" ADD COLUMN "id_detalleCuentaPorPagar_movimiento" INTEGER;
CREATE INDEX "MovimientoInventario_id_detalleCuentaPorPagar_movimiento_idx"
  ON "MovimientoInventario"("id_detalleCuentaPorPagar_movimiento");
ALTER TABLE "MovimientoInventario"
  ADD CONSTRAINT "MovimientoInventario_id_detalleCuentaPorPagar_movimiento_fkey"
  FOREIGN KEY ("id_detalleCuentaPorPagar_movimiento") REFERENCES "DetalleCuentaPorPagar"("id_detalleCuentaPorPagar")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MovimientoCaja" ADD COLUMN "id_cuentaPorPagar_mc" INTEGER;
CREATE INDEX "MovimientoCaja_id_cuentaPorPagar_mc_idx" ON "MovimientoCaja"("id_cuentaPorPagar_mc");
ALTER TABLE "MovimientoCaja"
  ADD CONSTRAINT "MovimientoCaja_id_cuentaPorPagar_mc_fkey"
  FOREIGN KEY ("id_cuentaPorPagar_mc") REFERENCES "CuentaPorPagar"("id_cuentaPorPagar")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- -------------------------------------------------------------------------
-- Impresion USB con cola persistente
-- -------------------------------------------------------------------------
CREATE TYPE "TipoTrabajoImpresion" AS ENUM ('COMANDA', 'FACTURA', 'PRUEBA');

ALTER TABLE "Impresora"
  ADD COLUMN "dispositivo_impresora" VARCHAR(100),
  ADD COLUMN "modelo_impresora" VARCHAR(50) NOT NULL DEFAULT 'EPSON TM-m30II',
  ALTER COLUMN "host_impresora" DROP NOT NULL;

CREATE TABLE "TrabajoImpresion" (
  "id_trabajoImpresion" SERIAL NOT NULL,
  "clave_idempotencia_trabajo" VARCHAR(100) NOT NULL,
  "tipo_trabajo" "TipoTrabajoImpresion" NOT NULL,
  "destino_trabajo" "DestinoImpresion" NOT NULL,
  "id_impresora_trabajo" INTEGER NOT NULL,
  "id_impresionComanda_trabajo" INTEGER,
  "id_factura_trabajo" INTEGER,
  "contenido_escpos_trabajo" BYTEA NOT NULL,
  "estado_trabajo" "EstadoImpresion" NOT NULL DEFAULT 'PENDIENTE',
  "intentos_trabajo" INTEGER NOT NULL DEFAULT 0,
  "proximo_intento_trabajo" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "token_bloqueo_trabajo" VARCHAR(50),
  "bloqueado_hasta_trabajo" TIMESTAMP(6),
  "ultimo_error_trabajo" VARCHAR(300),
  "fecha_creacion_trabajo" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fecha_actualizacion_trabajo" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrabajoImpresion_pkey" PRIMARY KEY ("id_trabajoImpresion")
);
CREATE UNIQUE INDEX "TrabajoImpresion_clave_idempotencia_trabajo_key" ON "TrabajoImpresion"("clave_idempotencia_trabajo");
CREATE INDEX "TrabajoImpresion_estado_trabajo_proximo_intento_trabajo_idx"
  ON "TrabajoImpresion"("estado_trabajo", "proximo_intento_trabajo");
CREATE INDEX "TrabajoImpresion_id_impresora_trabajo_idx" ON "TrabajoImpresion"("id_impresora_trabajo");
CREATE INDEX "TrabajoImpresion_id_impresionComanda_trabajo_idx" ON "TrabajoImpresion"("id_impresionComanda_trabajo");
CREATE INDEX "TrabajoImpresion_id_factura_trabajo_idx" ON "TrabajoImpresion"("id_factura_trabajo");
ALTER TABLE "TrabajoImpresion"
  ADD CONSTRAINT "TrabajoImpresion_id_impresora_trabajo_fkey"
  FOREIGN KEY ("id_impresora_trabajo") REFERENCES "Impresora"("id_impresora")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TrabajoImpresion_id_impresionComanda_trabajo_fkey"
  FOREIGN KEY ("id_impresionComanda_trabajo") REFERENCES "ImpresionComanda"("id_impresionComanda")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "TrabajoImpresion_id_factura_trabajo_fkey"
  FOREIGN KEY ("id_factura_trabajo") REFERENCES "Factura"("id_factura")
  ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
