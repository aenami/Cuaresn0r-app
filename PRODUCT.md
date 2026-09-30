# Producto

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Cada trabajador y administrador local pertenece a una sola área: Panadería o Restaurante / cafetería. Sus módulos y operaciones dependen de su rol.
- El panadero registra ingredientes, hornadas de Panadería y Pastelería y conteos; el cajero de panadería atiende mostrador, productos externos, proveedores, caja y remisiones.
- En restaurante, el cajero opera caja, inventario, impresoras y pedidos; el mesero trabaja en pedidos y el cocinero en inventario y pedidos. Cada trabajador consulta Mi nómina.
- El administrador local administra catálogos, empleados, usuarios, nómina y reportes de su área, además de impresoras en Restaurante, y puede operar su caja. El administrador global supervisa ambas áreas mediante un selector y conserva inventario, reportes, proveedores, cierres y remisiones; no tiene Usuarios, Catálogos, Nómina, Mi nómina ni Impresoras y no cobra, factura, paga ni opera turnos.

## Product Purpose

Un POS para la panadería y el restaurante/cafetería de la misma sede. Cada área conserva sus catálogos, existencias, proveedores, cuentas, cajas, empleados y nómina. La administración de personas, accesos, catálogos y nómina corresponde al administrador local de esa área; el global supervisa ambas.

## Operating Context

- Panadería vende panes, productos de pastelería y externos como bebidas, sin mesas ni fichas. Los ingredientes son insumos no vendibles; las hornadas consumen las cantidades de sus recetas.
- El saldo inicial del conteo procede del cierre anterior. En el primero sin cierre previo se usa el inventario del artículo; los productos de Restaurante, que no tienen stock propio, requieren un saldo inicial manual. En Panadería, producción y recepciones aumentan las existencias; ventas, consumo de recetas, remisiones, traslados y mermas las reducen. En Restaurante, marcar una meta `PRODUCIDO` suma entradas al conteo diario sin aumentar por sí solo `stock_ingrediente`.
- La remisión de Panadería a Restaurante se registra cuando ocurre la entrega física. El formulario trabaja con productos vendibles por unidades y cantidades enteras. Cada línea conserva cantidad, valor unitario, subtotal y concepto; la confirmación descuenta Panadería y aumenta el stock del ingrediente receptor de Restaurante con la misma unidad.
- Las remisiones agrupan entregas por turno (`TURNO`) o por día (`DIA`), sin mezclar modalidades en una misma fecha de Colombia. Cerrarlas bloquea nuevas entregas y genera la deuda completa del Restaurante; no admiten abonos. La diaria solo se cierra en turno único o tarde-noche.
- El cajero o administrador local de Restaurante registra el pago completo. El cajero o administrador local de Panadería confirma el ingreso una sola vez. Efectivo y transferencia mantienen su tratamiento separado en el cuadre.
- Se conservan los registros de traslados anteriores y sus recepciones; la sección operativa **Traslados** ya no aparece en Restaurante. Las remisiones de Panadería a Restaurante siguen activas. El historial no se borra ni se convierte en ventas.
- El conteo físico compara la salida aparente con las ventas, el consumo y los demás movimientos verificables. Cada conteo confirmado conserva su precio o costo de referencia: los productos muestran ingreso estimado por salidas corroboradas y pérdida por faltantes; los ingredientes muestran costo consumido y pérdida a costo. Los traslados y las mermas documentados justifican salidas sin atribuirles ventas ni faltantes; los sobrantes se muestran aparte. La valoración no crea ventas, cobros ni ajustes de existencias.
- Cada área realiza su propio cierre de caja y maneja sus comprobantes por separado.

## Capabilities and Constraints

- El restaurante conserva pedidos por ficha, comandas, subcuentas, cuadre de efectivo y conteo diario.
- Panadería dispone de venta directa, entradas de hornadas y externos, pagos mixtos, cuadre monetario y cuadre físico por artículo.
- La autorización se comprueba en navegación y API. Cambiar la URL o enviar otra área no concede acceso. `ADMIN_GLOBAL` y el rol heredado `ADMIN` son supervisores: no administran usuarios, empleados, catálogos, nómina ni impresoras y no realizan transacciones de dinero, ventas, facturación ni apertura/cierre de turnos. Cada usuario puede cambiar su propia contraseña desde Perfil.
- Inventario obtiene las referencias mínimas necesarias de los artículos del área propia; esto no abre el módulo Catálogos ni concede edición del catálogo.
- La valoración por rango de fechas está disponible para administradores locales y globales, con accesos rápidos a hoy, los últimos siete días y el mes actual. Agrupa por artículo y área, separando ingreso estimado de productos, costo consumido de ingredientes y pérdidas por faltantes. Solo suma valoraciones guardadas y vigentes; excluye e informa cuántos conteos están pendientes, no son comparables, requieren reconteo, carecen de referencia o no conservan valoración histórica. Los precios actuales no reconstruyen conteos antiguos. La API mensual existente sigue disponible.
- Conteo diario separa **Registro diario** y **Análisis por fechas** dentro del mismo módulo. Las fechas anteriores muestran únicamente sus registros persistidos, en solo lectura; las futuras muestran la lista fija actual como vista previa sin admitir cantidades ni crear conteos.
- Las migraciones `20260928120000_accesos_areas_remisiones` y `20260929090000_valoracion_conteos` se aplicaron únicamente al POS local, con respaldo privado previo verificado; no se aplicaron a Neon, Render ni Vercel. No se reimportó ni reinicializó stock ni se hizo un reset por las cuatro migraciones antiguas registradas en la base local pero ausentes del repositorio.
- Ya están preparados dos accesos `ADMIN_LOCAL` en el POS local, uno por área, vinculados a empleados técnicos mínimos sin tarifas ni jornadas. Desde esos accesos se administran los trabajadores reales del área y se opera caja. El global existente conserva su rol. Las credenciales quedan fuera del repositorio.
- **Pendiente:** confirmar si ambas áreas usan el mismo NIT y qué numeración fiscal corresponde a cada una. Los comprobantes internos no se presentan como facturas fiscales mientras esto no se resuelva.
- La guía operativa y la matriz de accesos están en [docs/ROLES_Y_AREAS.md](docs/ROLES_Y_AREAS.md); las reglas y ejemplos monetarios, en [docs/VALORACION_CONTEOS.md](docs/VALORACION_CONTEOS.md).

## Product Principles

- Toda salida y entrada de inventario debe tener origen verificable; una entrega o recepción ya registrada no se repite para reconstruir existencias.
- Una diferencia física se muestra y conserva; no se convierte silenciosamente en venta ni modifica ingresos registrados.
- Los cierres reflejan la caja y el inventario del área correspondiente.
- La supervisión global y la operación local son responsabilidades separadas, con permisos efectivos en el servidor.
