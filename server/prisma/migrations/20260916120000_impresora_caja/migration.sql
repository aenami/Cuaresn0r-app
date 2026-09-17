-- La impresora de caja recibe exclusivamente facturas y recibos de venta.
-- GENERAL conserva su significado anterior: cocina y barra compartidas.
ALTER TYPE "DestinoImpresion" ADD VALUE 'CAJA';
