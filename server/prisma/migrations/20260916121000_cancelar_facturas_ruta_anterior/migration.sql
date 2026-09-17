-- Las facturas en cola antes de crear CAJA apuntaban a una impresora de
-- preparacion. No deben salir por ella cuando el agente se conecte.
UPDATE "TrabajoImpresion"
SET "estado_trabajo" = 'FALLIDA',
    "ultimo_error_trabajo" = 'Factura pendiente en ruta de impresion anterior; reenviar desde Caja',
    "token_bloqueo_trabajo" = NULL,
    "bloqueado_hasta_trabajo" = NULL,
    "fecha_actualizacion_trabajo" = NOW()
WHERE "tipo_trabajo" = 'FACTURA'
  AND "estado_trabajo" IN ('PENDIENTE', 'REINTENTO', 'EN_PROCESO');
