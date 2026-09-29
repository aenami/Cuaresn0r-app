ALTER TYPE "TipoArticuloPanaderia" ADD VALUE 'PASTELERIA';
INSERT INTO "Rol" (nombre_rol) VALUES ('ADMIN_GLOBAL'), ('ADMIN_LOCAL'), ('PANADERO'), ('COCINERO') ON CONFLICT DO NOTHING;
UPDATE "Usuario" SET id_rol = (SELECT id_rol FROM "Rol" WHERE nombre_rol = 'ADMIN_GLOBAL') WHERE id_rol = (SELECT id_rol FROM "Rol" WHERE nombre_rol = 'ADMIN');
ALTER TABLE "Empleado" ADD COLUMN area "AreaNegocio" NOT NULL DEFAULT 'RESTAURANTE';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "Usuario" GROUP BY id_empleado_usuario HAVING count(DISTINCT area) > 1) THEN
    RAISE EXCEPTION 'Un empleado tiene usuarios de ambas áreas. Separa sus accesos antes de migrar; no se reasigna historia automáticamente.';
  END IF;
END $$;
UPDATE "Empleado" e SET area = u.area FROM "Usuario" u WHERE u.id_empleado_usuario = e.id_empleado;
ALTER TABLE "Proveedor" ADD COLUMN area "AreaNegocio" NOT NULL DEFAULT 'RESTAURANTE';
DROP INDEX "Proveedor_nombre_proveedor_key";
CREATE UNIQUE INDEX "Proveedor_area_nombre_proveedor_key" ON "Proveedor" (area, nombre_proveedor);
ALTER TABLE "CuentaPorPagar" ADD COLUMN area "AreaNegocio" NOT NULL DEFAULT 'RESTAURANTE';
CREATE INDEX "CuentaPorPagar_area_estado_idx" ON "CuentaPorPagar" (area, "estado_cuentaPorPagar");
ALTER TABLE "DetalleCuentaPorPagar" ADD COLUMN "articuloPanaderiaId" INTEGER REFERENCES "ArticuloPanaderia"(id) ON DELETE RESTRICT;
ALTER TABLE "DetalleCuentaPorPagar" DROP CONSTRAINT "DetalleCuentaPorPagar_objetivo_check";
ALTER TABLE "DetalleCuentaPorPagar" ADD CONSTRAINT "DetalleCuentaPorPagar_objetivo_check" CHECK (num_nonnulls("id_ingrediente_detalleCuenta", "id_producto_detalleCuenta", "articuloPanaderiaId") = 1);
ALTER TABLE "ConfiguracionNomina" ADD COLUMN area "AreaNegocio" NOT NULL DEFAULT 'RESTAURANTE';
ALTER TABLE "ConceptoNomina" ADD COLUMN area "AreaNegocio" NOT NULL DEFAULT 'RESTAURANTE';
DROP INDEX IF EXISTS "configuracion_nomina_activa_unica";
DROP INDEX IF EXISTS "configuracion_nomina_activa";
CREATE UNIQUE INDEX "configuracion_nomina_activa_por_area" ON "ConfiguracionNomina" (area) WHERE configuracion_activa = true;
CREATE TABLE "RemisionPanaderia" (
  id SERIAL PRIMARY KEY, "claveAgrupacion" VARCHAR(50) NOT NULL UNIQUE,
  fecha DATE NOT NULL, modalidad VARCHAR(10) NOT NULL CHECK (modalidad IN ('TURNO','DIA')),
  "turnoId" INTEGER NOT NULL REFERENCES "Turno"(id_turno),
  "fechaCreacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fechaCierre" TIMESTAMP(6), "cuentaPorPagarId" INTEGER UNIQUE REFERENCES "CuentaPorPagar"("id_cuentaPorPagar"),
  "turnoIngresoId" INTEGER REFERENCES "Turno"(id_turno), "fechaIngreso" TIMESTAMP(6), "metodoIngreso" "MetodoPago", 
  "montoTotal" DECIMAL(20,4) NOT NULL DEFAULT 0
);
CREATE TABLE "DetalleRemisionPanaderia" (
  id SERIAL PRIMARY KEY, "claveOperacion" VARCHAR(50) NOT NULL UNIQUE,
  "remisionId" INTEGER NOT NULL REFERENCES "RemisionPanaderia"(id),
  "articuloId" INTEGER NOT NULL REFERENCES "ArticuloPanaderia"(id),
  "ingredienteDestinoId" INTEGER NOT NULL REFERENCES "Ingrediente"(id_ingrediente),
  "usuarioId" INTEGER NOT NULL REFERENCES "Usuario"(id_usuario),
  "nombreSnapshot" VARCHAR(80) NOT NULL, cantidad DECIMAL(20,4) NOT NULL CHECK (cantidad > 0),
  "precioUnitario" DECIMAL(20,4) NOT NULL CHECK ("precioUnitario" > 0), subtotal DECIMAL(20,4) NOT NULL,
  concepto VARCHAR(150) NOT NULL, "fechaEntrega" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "MovimientoPanaderia" ADD COLUMN "remisionId" INTEGER REFERENCES "RemisionPanaderia"(id);
