# Valoración de conteos

La valoración de Inventario sirve para revisar salidas y diferencias físicas en Panadería y Restaurante. Se consulta junto al conteo diario y en **Análisis del conteo por fechas**. Todos los importes se expresan en COP; no registran ventas, cobros, utilidad ni movimientos de stock.

## Fijar y continuar el saldo de apertura

En Panadería se cuentan todos los artículos activos. Si todavía no hay un conteo anterior, **Inicio del día** parte del inventario del artículo: cuando hubo movimientos hoy, toma la existencia anterior al primero; si no los hubo, usa la existencia actual. Después de un conteo, la siguiente apertura encadena el último saldo físico con los movimientos reales posteriores, sin volver a sumar `AJUSTE_CONTEO`. Una fecha histórica sin conteo previo ni movimientos suficientes muestra la apertura como desconocida (`—`); no se rellena con el stock de hoy.

En Restaurante, el administrador configura la **Lista fija del conteo diario**. Para un `INGREDIENTE` sin cierre previo, el saldo inicial se obtiene automáticamente de `stock_ingrediente` y se revierten los movimientos reales que ya ocurrieron ese día, de modo que las entradas del día no se dupliquen al calcular el disponible. No se pide un saldo inicial manual. Un `PRODUCTO` no tiene ese stock propio: si no existe un conteo físico anterior, se indica manualmente un saldo inicial entero. En los días siguientes se usa el último conteo físico confirmado; retirar un elemento de la lista no borra sus cierres anteriores.

Marcar una meta del plan diario de Restaurante como `PRODUCIDO` ya incorpora su cantidad a las entradas del conteo de ese día, pero no incrementa por sí solo el caché `stock_ingrediente`. Verifica el origen antes de registrar una `ENTRADA` manual: no registres dos veces la misma producción.

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

Al confirmar, se guarda una valoración JSON con precio o costo, cantidades, nombre del artículo, unidad e importes de ese momento. Cambiar después un precio o costo no modifica los conteos ya confirmados. Un conteo antiguo sin valoración guardada no se reconstruye con precios actuales.

Si reabres un conteo, se elimina su valoración guardada. Si hay movimientos posteriores, pasa a **RECONTAR** y sus importes dejan de sumar. Registra el nuevo conteo físico y confirma otra vez para guardar una valoración vigente.

## Consultar un período

En Inventario → **Conteo diario**, cambia de **Registro diario** a **Análisis por fechas**. Esta vista separada comienza con los últimos siete días, incluido hoy en Colombia; no es necesario desplazarse hasta el final de la lista fija. Los accesos **Hoy**, **Últimos 7 días** y **Este mes** aplican el período de inmediato. Para un intervalo propio, elige **Desde** y **Hasta** y pulsa **Consultar**; cambiar una fecha sin consultar conserva el resultado anterior. Ambos extremos se incluyen. Se admiten fechas válidas entre 2000 y 9998 y un máximo de **366 días** contando ambos extremos.

En **Registro diario** puedes cambiar la fecha para ver los conteos guardados de días anteriores, incluso si el artículo ya no está activo en Panadería o fue retirado de la lista fija de Restaurante. El pasado es de solo lectura y no se reconstruye con la lista ni el stock actuales. En una fecha futura se muestra una vista previa de los elementos que están en la lista fija actual (o los artículos activos de Panadería); no se pueden ingresar ni confirmar cantidades hasta que llegue ese día.

El resumen agrupa por artículo y área dentro del período elegido. Mantiene separadas las tablas **Productos · precio de venta** e **Ingredientes · costo unitario** y muestra los días valorados, ingreso estimado o costo consumido, pérdida por faltantes y sobrante valorado. Las pérdidas de productos e ingredientes se muestran por separado; el costo consumido no se suma al ingreso estimado como ventas. Los importes proceden de las valoraciones históricas guardadas en cada conteo.

Esta consulta está disponible para administradores: el global elige el área desde su selector y el administrador local consulta únicamente la propia. Inventario usa referencias mínimas de artículos y no necesita abrir Catálogos. En móvil, cada tabla permite desplazarse horizontalmente para consultar los importes. La interfaz consulta `/recipes/inventory-valuation/range`; la API `/recipes/inventory-valuation/monthly` sigue disponible por compatibilidad.

Solo suman conteos con valoración guardada, válida y vigente. El resumen informa la cantidad excluida por cada causa:

| Estado | Qué hacer |
| --- | --- |
| **PENDIENTE** | Confirmar el conteo físico. |
| **RECONTAR** | Contar y confirmar nuevamente después de los movimientos posteriores. |
| **NO_COMPARABLE** | Revisar la base diaria y los movimientos antes de interpretar una diferencia monetaria. |
| **SIN_REFERENCIA** | Configurar el costo por unidad y confirmar de nuevo; no se supone un costo de cero. |
| **SIN_VALORACION_HISTORICA** | Mantener el registro antiguo fuera de los importes; no asignarle precios actuales. |

Si todavía no hay conteos vigentes en el período, el resumen muestra un estado vacío. Si falla la consulta, usa **Reintentar**. Estos estados no modifican caja ni inventario.

## Alcance instalado

La migración `20260929090000_valoracion_conteos` se aplicó solo al POS local, con respaldo privado previo verificado. No se aplicó a Neon, Render ni Vercel; no se reinicializaron existencias ni se hizo un reset por las cuatro migraciones antiguas registradas en la base local pero ausentes del repositorio. La valoración es operativa y no resuelve el NIT ni la numeración fiscal pendientes de ambas áreas.
