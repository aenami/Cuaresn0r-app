# Producto

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Cada cajero pertenece a una sola area. Los trabajadores registran ventas, entradas de mercancia y conteos diarios durante su turno.
- Administradores configuran articulos, revisan cuadre e historial de las dos areas del negocio.

## Product Purpose

Un POS para la panaderia y el restaurante/cafeteria de la misma sede. Cada area opera con ventas, existencias, caja y cierre separados; los administradores pueden consultar ambas.

## Operating Context

- Panaderia vende panes horneados durante el dia y productos externos como bebidas, sin mesas ni fichas.
- El saldo inicial del inventario procede del cierre anterior. Produccion y recepciones aumentan las existencias; ventas y traslados las reducen.
- La mercancia entre panaderia y restaurante se transfiere en ambos sentidos con cantidad y precio pactado por operacion. El area receptora confirma la entrega y debe pagarla.
- Restaurante solo envia ingredientes con stock; panaderia conserva su unidad y fracciones en un insumo no vendible de igual unidad.
- El conteo fisico compara la salida aparente con las ventas registradas. Los faltantes se valoran para revision, sin crear una venta automaticamente.
- Cada area realiza su propio cierre de caja y maneja sus comprobantes por separado.

## Capabilities and Constraints

- El restaurante conserva pedidos por ficha, comandas, subcuentas, cuadre de efectivo y conteo diario.
- La panaderia necesita venta directa, entradas de hornadas y bebidas, pagos mixtos, cuadre monetario y cuadre fisico por articulo.
- **Pendiente:** confirmar si ambas areas usan el mismo NIT y que numeracion fiscal corresponde a cada una. Los comprobantes internos no se presentan como facturas fiscales mientras esto no se resuelva.

## Product Principles

- Toda salida y entrada de inventario debe tener origen verificable.
- Una diferencia fisica se muestra y conserva; no se convierte silenciosamente en venta ni modifica ingresos registrados.
- Los cierres reflejan la caja y el inventario del area correspondiente.
