-- Indice unico parcial: a lo sumo una Receta activa por producto.
-- No expresable en schema.prisma (sin soporte de WHERE en @@unique), ver
-- nota de la seccion 19 de consideraciones al inicio de schema.prisma.
-- Complementa (defensa en profundidad) la desactivacion explicita que ya
-- hace RecipesService.createVersion en la misma transaccion.
CREATE UNIQUE INDEX "receta_activa_por_producto" ON "Receta" ("id_producto_receta") WHERE "receta_activa" = true;
