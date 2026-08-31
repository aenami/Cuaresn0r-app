-- Indices parciales "solo una activa" recomendados por la spec (seccion 19),
-- mismo patron que receta_activa_por_producto y la config de facturacion.
-- No expresables en schema.prisma, por eso van solo en SQL.

CREATE UNIQUE INDEX "tarifa_activa_por_empleado"
  ON "TarifaEmpleado" ("id_empleado_tarifaEmpleado")
  WHERE "tarifa_activa" = true;

CREATE UNIQUE INDEX "configuracion_nomina_activa_unica"
  ON "ConfiguracionNomina" ("configuracion_activa")
  WHERE "configuracion_activa" = true;

CREATE UNIQUE INDEX "valor_activo_por_concepto"
  ON "ValorConceptoNomina" ("id_concepto_valorConceptoNomina")
  WHERE "valor_activo" = true;

-- Un empleado no puede tener dos jornadas ABIERTA a la vez (seccion 11).
CREATE UNIQUE INDEX "jornada_abierta_por_empleado"
  ON "Jornada" ("id_empleado_jornada")
  WHERE "estado_jornada" = 'ABIERTA';
