# Valoración de conteos

La valoración de Inventario sirve para revisar salidas y diferencias físicas en Panadería y Restaurante. Se consulta junto al conteo diario y en **Valoración mensual del inventario**. Todos los importes se expresan en COP; no registran ventas, cobros, utilidad ni movimientos de stock.

## Leer los importes

| Artículo | Referencia al confirmar | Salida corroborada | Faltante |
| --- | --- | --- | --- |
| Producto vendible | Precio de venta por unidad | Ingreso estimado por ventas POS o entregas que corroboran una venta | Pérdida estimada al mismo precio |
| Ingrediente o insumo no vendible | Costo por unidad | Costo consumido corroborado; no es dinero cobrado | Pérdida estimada al mismo costo |

La cantidad reconocida no supera la salida física estimada ni la cantidad corroborada. Primero se descuentan las salidas justificadas por traslados y mermas documentados: no cuentan como venta ni como faltante. Una salida física sin venta o consumo corroborado queda como faltante para investigar. La merma registrada conserva su propio historial y no se vuelve a imputar como faltante.

Un sobrante se presenta por separado, con su cantidad y valor de referencia. No aumenta el ingreso estimado ni compensa pérdidas de otros artículos o días.

### Producto

Si la salida física estimada es de 10 unidades y el POS corrobora 7 ventas a $2.500 por unidad, el conteo muestra **$17.500 de ingreso estimado** y **$7.500 de pérdida por las 3 unidades faltantes**. No presume que las 10 unidades se cobraron.

### Ingrediente

Con 2 kg de consumo corroborado a un costo de $4.500/kg y 0,5 kg adicionales sin salida justificada, muestra **$9.000 de costo consumido** y **$2.250 de pérdida por faltante**. El consumo no es ingreso ni dinero cobrado. Se conservan las cantidades fraccionarias.

## Configurar la referencia y confirmar

Los productos usan su precio de venta. Los ingredientes de Restaurante usan el costo existente. En Panadería, el `INSUMO` admite un `costoReferencia` opcional en COP por la unidad del artículo, con hasta cuatro decimales. Dejarlo vacío (`null`) significa que no hay referencia y excluye ese conteo de los importes; un costo explícito de `0` sí es una referencia válida.

Al confirmar, se guarda una valoración JSON con precio o costo, cantidades, artículo, unidad e importes de ese momento. Cambiar después un precio o costo no modifica los conteos ya confirmados. Un conteo antiguo sin valoración guardada no se reconstruye con precios actuales.

Si reabres un conteo, se elimina su valoración guardada. Si hay movimientos posteriores, pasa a **RECONTAR** y sus importes dejan de sumar. Registra el nuevo conteo físico y confirma otra vez para guardar una valoración vigente.

## Consultar el mes

El resumen agrupa por artículo, área y mes de Colombia. Mantiene separadas las tablas **Productos · precio de venta** e **Ingredientes · costo unitario** y muestra los días valorados, ingreso estimado o costo consumido, pérdida por faltantes y sobrante valorado. No suma costo consumido con ingreso de productos como una cifra de ventas.

El resumen mensual está disponible para administradores: el global elige el área desde su selector y el administrador local consulta únicamente la propia. Inventario usa referencias mínimas de artículos y no necesita abrir Catálogos. En móvil, la tabla permite desplazarse horizontalmente para consultar los importes.

Solo suman conteos con valoración guardada, válida y vigente. El resumen informa la cantidad excluida por cada causa:

| Estado | Qué hacer |
| --- | --- |
| **PENDIENTE** | Confirmar el conteo físico. |
| **RECONTAR** | Contar y confirmar nuevamente después de los movimientos posteriores. |
| **NO_COMPARABLE** | Revisar la base diaria y los movimientos antes de interpretar una diferencia monetaria. |
| **SIN_REFERENCIA** | Configurar el costo por unidad y confirmar de nuevo; no se supone un costo de cero. |
| **SIN_VALORACION_HISTORICA** | Mantener el registro antiguo fuera de los importes; no asignarle precios actuales. |

Si todavía no hay conteos vigentes, el resumen muestra un estado vacío. Si falla la consulta, usa **Reintentar**. Estos estados no modifican caja ni inventario.

## Alcance instalado

La migración `20260929090000_valoracion_conteos` se aplicó solo al POS local, con respaldo privado previo verificado. No se aplicó a Neon, Render ni Vercel; no se reinicializaron existencias ni se hizo un reset por las cuatro migraciones antiguas registradas en la base local pero ausentes del repositorio. La valoración es operativa y no resuelve el NIT ni la numeración fiscal pendientes de ambas áreas.
