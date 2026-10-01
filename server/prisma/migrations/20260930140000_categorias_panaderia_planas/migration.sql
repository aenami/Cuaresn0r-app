-- Las categorias existentes conservan sus IDs y las referencias de articulos.
-- Una categoria con el mismo nombre podia existir en varios tipos; se distingue
-- solo a las repetidas antes de exigir nombres globalmente unicos.
DO $$
DECLARE
    duplicada RECORD;
    sufijo TEXT;
    candidato TEXT;
    intento INTEGER;
BEGIN
    FOR duplicada IN
        SELECT "id", "nombre", "tipo"
        FROM (
            SELECT "id", "nombre", "tipo",
                   ROW_NUMBER() OVER (PARTITION BY LOWER(BTRIM("nombre")) ORDER BY "id") AS posicion
            FROM "CategoriaPanaderia"
        ) AS categorias
        WHERE posicion > 1
        ORDER BY "id"
    LOOP
        intento := 0;
        LOOP
            sufijo := ' (' || duplicada."tipo"::TEXT || ' #' || duplicada."id"::TEXT ||
                      CASE WHEN intento = 0 THEN '' ELSE '-' || intento::TEXT END || ')';
            candidato := LEFT(BTRIM(duplicada."nombre"), 60 - CHAR_LENGTH(sufijo)) || sufijo;
            EXIT WHEN NOT EXISTS (
                SELECT 1 FROM "CategoriaPanaderia"
                WHERE "id" <> duplicada."id"
                  AND LOWER(BTRIM("nombre")) = LOWER(BTRIM(candidato))
            );
            intento := intento + 1;
        END LOOP;
        UPDATE "CategoriaPanaderia" SET "nombre" = candidato WHERE "id" = duplicada."id";
    END LOOP;
END $$;

DROP INDEX "CategoriaPanaderia_tipo_nombre_key";
ALTER TABLE "CategoriaPanaderia" DROP COLUMN "tipo";
CREATE UNIQUE INDEX "CategoriaPanaderia_nombre_key" ON "CategoriaPanaderia"("nombre");
CREATE UNIQUE INDEX "CategoriaPanaderia_nombre_normalizado_key" ON "CategoriaPanaderia"(LOWER(BTRIM("nombre")));

-- No permitir que borrar una categoria utilizada desvincule articulos antiguos.
ALTER TABLE "ArticuloPanaderia" DROP CONSTRAINT "ArticuloPanaderia_categoriaId_fkey";
ALTER TABLE "ArticuloPanaderia" ADD CONSTRAINT "ArticuloPanaderia_categoriaId_fkey"
    FOREIGN KEY ("categoriaId") REFERENCES "CategoriaPanaderia"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
