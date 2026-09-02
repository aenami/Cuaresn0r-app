-- Trazabilidad de cuentas por pagar, pedidos organizados por cliente y
-- regularizacion visible de comandas autorizadas antes del pago.
BEGIN;

CREATE TYPE "ModalidadCuentaPedido" AS ENUM ('UNICA', 'POR_CUENTA');

ALTER TABLE "Pedido"
  ADD COLUMN "modalidad_cuenta_pedido" "ModalidadCuentaPedido" NOT NULL DEFAULT 'UNICA';

ALTER TABLE "Comanda"
  ADD COLUMN "fecha_regularizacion_pago_comanda" TIMESTAMP(6);

ALTER TABLE "CuentaPorPagar"
  ADD COLUMN "fecha_registro_cuentaPorPagar" TIMESTAMP(6),
  ADD COLUMN "fecha_actualizacion_cuentaPorPagar" TIMESTAMP(6),
  ADD COLUMN "fecha_pago_total_cuentaPorPagar" TIMESTAMP(6);

-- Para las cuentas historicas, la fecha de emision es la mejor aproximacion
-- disponible a su registro original. La ultima actividad toma recepcion o el
-- pago mas reciente cuando existen.
UPDATE "CuentaPorPagar" cuenta
SET
  "fecha_registro_cuentaPorPagar" = cuenta."fecha_emision_cuentaPorPagar"::timestamp,
  "fecha_actualizacion_cuentaPorPagar" = GREATEST(
    cuenta."fecha_emision_cuentaPorPagar"::timestamp,
    COALESCE(cuenta."fecha_recepcion_mercancia", cuenta."fecha_emision_cuentaPorPagar"::timestamp),
    COALESCE(
      (
        SELECT MAX(pago."fecha_pagoCuentaPorPagar")
        FROM "PagoCuentaPorPagar" pago
        WHERE pago."id_cuentaPorPagar_pago" = cuenta."id_cuentaPorPagar"
      ),
      cuenta."fecha_emision_cuentaPorPagar"::timestamp
    )
  ),
  "fecha_pago_total_cuentaPorPagar" = CASE
    WHEN cuenta."estado_cuentaPorPagar" = 'PAGADA' THEN (
      SELECT MAX(pago."fecha_pagoCuentaPorPagar")
      FROM "PagoCuentaPorPagar" pago
      WHERE pago."id_cuentaPorPagar_pago" = cuenta."id_cuentaPorPagar"
    )
    ELSE NULL
  END;

ALTER TABLE "CuentaPorPagar"
  ALTER COLUMN "fecha_registro_cuentaPorPagar" SET NOT NULL,
  ALTER COLUMN "fecha_registro_cuentaPorPagar" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "fecha_actualizacion_cuentaPorPagar" SET NOT NULL,
  ALTER COLUMN "fecha_actualizacion_cuentaPorPagar" SET DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "CuentaPorPagar_fecha_registro_cuentaPorPagar_idx"
  ON "CuentaPorPagar"("fecha_registro_cuentaPorPagar");
CREATE INDEX "CuentaPorPagar_fecha_pago_total_cuentaPorPagar_idx"
  ON "CuentaPorPagar"("fecha_pago_total_cuentaPorPagar");

COMMIT;
