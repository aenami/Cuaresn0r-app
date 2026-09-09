-- Conserva la fotografia informativa de cuentas por pagar que existia cuando
-- se confirmo cada cuadre. Los demas valores se derivan de movimientos y pagos
-- inmutables ligados al turno.
ALTER TABLE "Turno"
ADD COLUMN "facturas_pendientes_cierre_turno" JSONB;
