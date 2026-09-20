CREATE TABLE "ElementoConteoDiario" (
  "id" SERIAL PRIMARY KEY,
  "tipo" "TipoObjetivoProduccion" NOT NULL,
  "idProducto" INTEGER UNIQUE REFERENCES "Producto"("id_producto") ON DELETE RESTRICT ON UPDATE CASCADE,
  "idIngrediente" INTEGER UNIQUE REFERENCES "Ingrediente"("id_ingrediente") ON DELETE RESTRICT ON UPDATE CASCADE,
  "cantidadInicial" DECIMAL(20,4) NOT NULL CHECK ("cantidadInicial" >= 0),
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "fechaInicio" DATE NOT NULL,
  CONSTRAINT "ElementoConteoDiario_objetivo_check" CHECK (
    ("tipo" = 'PRODUCTO' AND "idProducto" IS NOT NULL AND "idIngrediente" IS NULL)
    OR ("tipo" = 'INGREDIENTE' AND "idIngrediente" IS NOT NULL AND "idProducto" IS NULL)
  )
);

-- Se conserva como lista inicial la selección de la última jornada registrada.
-- No se modifican ni duplican los conteos históricos.
INSERT INTO "ElementoConteoDiario" ("tipo", "idProducto", "idIngrediente", "cantidadInicial", "fechaInicio")
SELECT "tipo_objetivo_conteoInventario", "id_producto_conteoInventario",
       "id_ingrediente_conteoInventario", "cantidad_anterior_conteoInventario",
       (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::date
FROM "ConteoInventarioDiario"
WHERE "fecha_conteoInventario" = (SELECT MAX("fecha_conteoInventario") FROM "ConteoInventarioDiario");
