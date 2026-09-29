-- Las valoraciones empiezan con la próxima confirmación del conteo.
-- No se reconstruyen históricos usando precios actuales.
ALTER TABLE "ConteoInventarioDiario" ADD COLUMN "valoracion" JSONB;
ALTER TABLE "ConteoPanaderia" ADD COLUMN "valoracion" JSONB;
ALTER TABLE "ArticuloPanaderia" ADD COLUMN "costoReferencia" DECIMAL(12,4);
