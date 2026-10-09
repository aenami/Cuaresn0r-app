# Recorrido de demostración del POS

Muestra cargada el **9 de octubre de 2026**, únicamente en la base **POS local**.
Los registros nuevos se identifican con `[MUESTRA]`; no se borraron los ejemplos
anteriores, no se cambiaron contraseñas ni se cerraron los turnos que estaban
abiertos. La base de Neon no recibió estos datos.

## Preparar la presentación

1. Inicia el servidor y el cliente local, y entra a
   [la aplicación local](http://localhost:5173).
2. Usa el administrador local del área que quieras mostrar:
   `admin.panaderia@pos.local` o `admin.restaurante@pos.local`, con sus
   contraseñas existentes. El administrador global conserva sus permisos de
   supervisión; no puede cobrar.
3. Para reportes y conteos, selecciona **02/10/2026 a 08/10/2026**. Es la semana
   completa de la muestra. Si usas «Últimos 7 días», el rango depende del día
   actual y puede excluir parte de ella.

## Panadería: una venta rápida

En **Venta de mostrador**, busca `campesino` y selecciona el artículo `[MUESTRA]`.
Tiene precio de **$2.500** por unidad.

- El buscador está enfocado al entrar. **↓** pasa a los productos; las cuatro
  flechas recorren los disponibles y **Enter** agrega el seleccionado.
- **Enter** desde el buscador agrega el primer resultado disponible; **Esc**
  devuelve el foco al buscador y **F2** abre el modal de cobro.
- Para una unidad, escribe **$10.000** en «Efectivo que entrega el cliente»:
  la devuelta debe ser **$7.500**. En caja se registran $2.500, no el billete
  completo. Un recibido inferior al efectivo aplicado bloquea la confirmación.
- También puedes separar efectivo, Nequi/transferencia y tarjeta. La devuelta
  se calcula solo sobre la parte en efectivo. Si no escribes el recibido, se
  asume pago exacto.
- Después de confirmar, el carrito y el buscador quedan limpios y el foco
  vuelve automáticamente a la búsqueda.

**Confirmar aquí sí crea una venta real en tu base de pruebas y descuenta stock.**
Las verificaciones automatizadas del cobro usaron respuestas simuladas para no
sumar ventas adicionales a la muestra.

## Caja: cuentas y cuadres

En **Caja → Cuentas**, consulta el **08/10/2026**:

- Panadería tiene **6 ventas** distribuidas entre mañana y tarde-noche. Activa
  «Separar por turno» y abre una venta para ver productos y pagos mixtos.
- «Ver comprobante» permite consultar e imprimir/guardar un recibo interno.
  **No es factura fiscal ni impresión directa mediante el agente térmico**;
  la definición fiscal de Panadería continúa pendiente.
- Restaurante tiene **4 cuentas pagadas** ese día, también separadas por turno.
- En el Flujo de caja de Panadería, el registro de movimientos ya no mezcla
  ventas ni ofrece su filtro: consúltalas en Cuentas. Los totales de caja siguen
  incluyendo los ingresos por ventas.

En **Cuadre → historial**, revisa ambos turnos de los días de la muestra. Hay
pagos a empleados, proveedores, gastos de aseo, recaudo digital y base de
**$300.000**. Los pagos abren su detalle desde el historial.

- **04/10:** cierres con $1.000 de faltante de efectivo por turno.
- **06/10:** cierres con $500 de sobrante por turno.
- Los otros cierres de la muestra quedan sin diferencia de efectivo.
- Las facturas pendientes reflejan el saldo existente al cerrar, no el saldo
  actual luego de pagos posteriores.

## Inventario: conteo y análisis

En cualquiera de las áreas, abre **Inventario → Conteo diario**.

1. Elige **08/10/2026** para ver un cierre histórico de solo lectura.
2. Busca `agua`: la lista muestra solo los productos/ingredientes coincidentes.
   La búsqueda ignora mayúsculas y acentos. Los indicadores generales conservan
   el total de la lista, no solo los resultados filtrados.
3. En Restaurante las tarjetas son más compactas; «Más detalle» despliega la
   información secundaria sin ocultar las diferencias ni la valoración.
4. Cambia a una fecha futura: aparece la lista fija vigente, pero no se puede
   ingresar un conteo. En la fecha actual aparecen los pendientes del día.
5. Abre la pestaña interna **Análisis por fechas** y consulta la semana completa.

Ejemplos para explicar las diferencias:

- **Panadería, 04/10:** faltan 2 aguas, pérdida estimada **$6.000**.
- **Panadería, 07/10:** faltan 3 panes campesinos, pérdida estimada **$7.500**.
- **Panadería, 06/10:** una porción de torta sobrante, valorada en **$7.500**;
  no se presenta como ingreso ni compensa los faltantes.
- **Restaurante, 03/10:** faltan 2 aguas, pérdida estimada **$6.000**.
- También hay salidas justificadas de pan francés: no son ventas ni faltantes.

La muestra tiene **133 conteos históricos**. La suma de ambas áreas para esa
semana es **$1.621.800 de ingreso estimado** y **$19.500 de pérdidas estimadas**.
El ingreso corresponde a los productos incluidos en el conteo y sus salidas
corroboradas: **no es la venta total del negocio ni la utilidad**. Los insumos
se valoran a costo consumido, separado del ingreso por productos.

## Producción, proveedores y remisiones

- **Producción de Panadería:** 7 hojas históricas finalizadas y una hoja con
  avance de hoy. Consulta panes/postres, cantidades, precio de catálogo de
  ese momento, subtotales y total. Las entradas de producción tienen vinculada
  su entrada de existencias y consumo de receta, sin duplicarlas.
- **Inventario → Producción diaria:** metas para hoy y mañana. Resolver una
  meta no sustituye el registro de una hornada en la hoja de producción.
- **Ingredientes:** harina, azúcar, mantequilla y levadura; en Restaurante
  hay ejemplos de stock bajo, normal y alto.
- **Proveedores y cuentas:** compras recibidas, pagadas y parcialmente pagadas;
  una compra de Panadería de **$42.000** está pendiente de recepción y todavía
  no suma existencias.
- **Remisiones:** 3 entregas de 5 panes campesinos a $1.800 por unidad,
  **$9.000** cada una, de los días 02, 05 y 08/10. Las dos primeras están
  pagadas y la última sigue pendiente. La salida no se cuenta como pérdida de
  Panadería; la recepción queda vinculada al ingrediente de Restaurante.
- Los formularios de ingreso, edición, conteo, recetas, metas, hornadas,
  remisiones y apertura de caja de Panadería se abren en modales. El formato
  principal del cuadre conserva su página de trabajo.

## Composición y verificación de la muestra

- 18 artículos de Panadería: 6 panes, 4 postres, 4 externos y 4 insumos.
- 10 recetas de Panadería, 6 productos y 5 ingredientes de Restaurante.
- 42 ventas de mostrador, total **$1.013.300**.
- 28 cuentas de Restaurante, total **$868.000**.
- 28 turnos cerrados, 8 hojas de producción y 133 conteos históricos.

El script es aditivo y reconoce la muestra existente para no duplicarla. Rechaza
conexiones que no sean `localhost/POS` o `127.0.0.1/POS`. Desde la carpeta
`server`, con el servidor compilado, puedes ejecutar:

```powershell
node scripts/seed-showcase-local.cjs --plan
node scripts/seed-showcase-local.cjs --verify
```

`--plan` no escribe. `--verify` comprueba importes, pagos, stock, vínculos de
producción, cuadres y valoraciones. `--apply` se usó para cargar la muestra;
en una carga inicial exige el respaldo privado previamente verificado.
El respaldo **POS-antes-muestra-20261009.dump** está en `server/backups/`, fuera
de Git. No ejecutes una restauración para limpiar datos sin guardar antes los
cambios nuevos: restaurar ese respaldo reemplazaría el estado posterior.

Los cambios de código se publican con el push; **eso no publica esta muestra en
la nube**. La prueba física de las impresoras sigue pendiente en el PC de caja.
