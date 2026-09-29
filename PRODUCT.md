# Producto

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Cada trabajador y administrador local pertenece a una sola área: Panadería o Restaurante / cafetería. Sus módulos y operaciones dependen de su rol.
- El panadero registra ingredientes, hornadas de Panadería y Pastelería y conteos; el cajero de panadería atiende mostrador, productos externos, proveedores, caja y remisiones.
- En restaurante, el cajero opera caja, inventario, impresoras y pedidos; el mesero trabaja en pedidos y el cocinero en inventario y pedidos. Cada trabajador consulta Mi nómina.
- El administrador local administra catálogos, empleados, usuarios, nómina y reportes de su área y puede operar su caja. El administrador global administra y supervisa ambas áreas mediante un selector, sin cobrar, facturar ni operar turnos.

## Product Purpose

Un POS para la panadería y el restaurante/cafetería de la misma sede. Cada área conserva sus catálogos, existencias, proveedores, cuentas, cajas, empleados y nómina. El administrador global puede gestionar ambas; los accesos locales solo operan su área.

## Operating Context

- Panadería vende panes, productos de pastelería y externos como bebidas, sin mesas ni fichas. Los ingredientes son insumos no vendibles; las hornadas consumen las cantidades de sus recetas.
- El saldo inicial del inventario procede del cierre anterior. Producción y recepciones aumentan las existencias; ventas, consumo de recetas, remisiones, traslados y mermas las reducen.
- La remisión de Panadería a Restaurante se registra cuando ocurre la entrega física. El formulario trabaja con productos vendibles por unidades y cantidades enteras. Cada línea conserva cantidad, valor unitario, subtotal y concepto; la confirmación descuenta Panadería y aumenta el stock del ingrediente receptor de Restaurante con la misma unidad.
- Las remisiones agrupan entregas por turno (`TURNO`) o por día (`DIA`), sin mezclar modalidades en una misma fecha de Colombia. Cerrarlas bloquea nuevas entregas y genera la deuda completa del Restaurante; no admiten abonos. La diaria solo se cierra en turno único o tarde-noche.
- El cajero o administrador local de Restaurante registra el pago completo. El cajero o administrador local de Panadería confirma el ingreso una sola vez. Efectivo y transferencia mantienen su tratamiento separado en el cuadre.
- Se conservan los traslados anteriores y las recepciones de Restaurante a Panadería: Restaurante envía ingredientes con stock y Panadería confirma su recepción como insumo no vendible de igual unidad, conservando sus fracciones.
- El conteo físico compara la salida aparente con las ventas y los demás movimientos verificables. Los faltantes se valoran para revisión, sin crear una venta automáticamente.
- Cada área realiza su propio cierre de caja y maneja sus comprobantes por separado.

## Capabilities and Constraints

- El restaurante conserva pedidos por ficha, comandas, subcuentas, cuadre de efectivo y conteo diario.
- Panadería dispone de venta directa, entradas de hornadas y externos, pagos mixtos, cuadre monetario y cuadre físico por artículo.
- La autorización se comprueba en navegación y API. Cambiar la URL o enviar otra área no concede acceso. `ADMIN_GLOBAL` y el rol heredado `ADMIN` son supervisores: no realizan transacciones de dinero, pagos de nómina, ventas, facturación ni apertura/cierre de turnos.
- La migración `20260928120000_accesos_areas_remisiones` ya se aplicó únicamente al POS local, con respaldo privado previo; no se aplicó a producción. Convierte los usuarios `ADMIN` anteriores a `ADMIN_GLOBAL`. Para operar caja se deben crear empleados y usuarios `ADMIN_LOCAL` de cada área. No se reimporta ni reinicializa stock.
- **Pendiente:** confirmar si ambas áreas usan el mismo NIT y qué numeración fiscal corresponde a cada una. Los comprobantes internos no se presentan como facturas fiscales mientras esto no se resuelva.
- La guía operativa y la matriz de accesos están en [docs/ROLES_Y_AREAS.md](docs/ROLES_Y_AREAS.md).

## Product Principles

- Toda salida y entrada de inventario debe tener origen verificable; una entrega o recepción ya registrada no se repite para reconstruir existencias.
- Una diferencia física se muestra y conserva; no se convierte silenciosamente en venta ni modifica ingresos registrados.
- Los cierres reflejan la caja y el inventario del área correspondiente.
- La supervisión global y la operación local son responsabilidades separadas, con permisos efectivos en el servidor.
