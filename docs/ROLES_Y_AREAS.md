# Roles, áreas y remisiones

Guía del operador para CorePOS. Áreas disponibles: **Panadería** y **Restaurante / cafetería**. Los nombres técnicos de área son `PANADERIA` y `RESTAURANTE`.

## Elegir el acceso correcto

Cada empleado y usuario local pertenece a una sola área. Un cajero de Panadería no puede operar Restaurante, ni el cajero de Restaurante puede operar Panadería. El servidor verifica el rol y el área aunque se escriba una URL directamente.

| Rol | Área | Trabajo permitido |
| --- | --- | --- |
| Administrador global (`ADMIN_GLOBAL`; `ADMIN` heredado equivale a global) | Ambas, mediante selector | Administra catálogos, proveedores, cajas, empleados, usuarios, configuración de nómina y reportes del área seleccionada. Consulta inventario, cuentas, cierres y remisiones. No cobra, factura, paga cuentas o nómina, prepara pedidos ni abre o cierra turnos. |
| Administrador local (`ADMIN_LOCAL`) | Solo su área | Administra catálogos, empleados, usuarios, proveedores, cajas, nómina y reportes de su área; también puede operar su caja y los flujos correspondientes a esa área. No concede acceso global ni reasigna a otra área. |
| Panadero (`PANADERO`) | Panadería | Inventario de ingredientes, recetas, entradas y mermas de insumos, hornadas de Panadería y Pastelería, conteo y recepción de insumos enviados desde Restaurante; Mi nómina. |
| Cajero (`CAJERO`) | Panadería | Venta de mostrador, entradas y mermas de externos, conteo, proveedores y cuentas, caja, remisiones; Mi nómina. Las hornadas y entradas de ingredientes corresponden al panadero o administrador. |
| Cajero (`CAJERO`) | Restaurante | Caja y cobro, inventario, impresoras, pedidos, proveedores y cuentas, traslados y pago de remisiones; Mi nómina. |
| Mesero (`MESERO`) | Restaurante | Pedidos; Mi nómina. |
| Cocinero (`COCINERO`) | Restaurante | Inventario y pedidos; Mi nómina. |

La administración del catálogo es exclusiva de administradores; consultar productos al tomar un pedido no concede acceso para modificarlos. Los trabajadores consultan su propia nómina; la configuración y gestión de nómina corresponden al administrador del área. Los pagos son operaciones locales: el administrador global no los ejecuta.

El selector **Área que estás consultando** aparece para el administrador global. Al cambiarlo, los módulos muestran los datos de esa área. El selector no convierte su sesión en una sesión de caja. En caja, el global consulta **Cierres de caja**.

## Preparar la operación local

La migración `20260928120000_accesos_areas_remisiones` **ya se aplicó al POS local con un respaldo privado previo**. No se aplicó a producción. Los usuarios que antes eran `ADMIN` pasan a `ADMIN_GLOBAL`; el rol heredado también se interpreta como supervisión global si aún aparece en una sesión.

Antes de operar caja, el administrador global debe crear o configurar un empleado y su usuario `ADMIN_LOCAL` en Panadería y otro en Restaurante, o los cajeros de cada área. Inicia sesión con el usuario operativo del área correspondiente y abre su turno. Crear accesos no requiere reimportar existencias ni volver a registrar movimientos históricos.

Si el menú o una acción no corresponde al trabajo previsto, revisa el rol y el área asignados al usuario. No uses un acceso global para resolver un cobro bloqueado: entra con el cajero o administrador local del área.

## Inventario y catálogo de Panadería

El catálogo distingue **Panadería · panes**, **Pastelería · postres** y productos **Externos**. Los ingredientes son insumos no vendibles y se administran desde Inventario. El panadero registra hornadas y el sistema descuenta los ingredientes de las recetas. El cajero registra las entradas de externos, como bebidas.

El conteo diario compara inicio del día, entradas, ventas POS, consumo de recetas y demás salidas con la existencia física. Una diferencia valorada es una estimación para investigar: no crea una venta ni un ingreso de caja. Si después del conteo entran o salen artículos, vuelve a contar antes del cierre cuando el sistema lo indique.

## Entregar Panadería a Restaurante

El módulo **Remisiones** reúne entregas físicas; cada entrega conserva su propio valor. El formulario trabaja con productos vendibles por piezas (`UNIDADES`) y solicita cantidades enteras. El restaurante debe tener creado el artículo receptor como ingrediente con la **misma unidad** del producto de Panadería. No conviertas unidades al registrar la entrega.

1. El cajero o administrador local de Panadería abre su turno y elige cómo agrupar las entregas: una remisión por turno (`TURNO`) o una remisión por día (`DIA`). La primera entrega fija la modalidad de esa fecha; no se permite mezclar ambas en el mismo día de Colombia.
2. Selecciona el producto activo y vendible de Panadería y el ingrediente receptor de Restaurante de igual unidad. Registra cantidad, valor unitario en COP y concepto. Revisa el subtotal de la línea.
3. Pulsa **Confirmar entrega** solo cuando la mercancía ya se haya entregado físicamente. Esta acción descuenta la existencia de Panadería y aumenta el stock del ingrediente receptor en Restaurante. No vuelvas a registrarla como recepción o entrada manual.
4. Repite el registro para las entregas siguientes. La remisión suma sus subtotales; cada línea mantiene cantidad, precio y concepto.
5. Cuando todas las entregas del documento estén completas, pulsa **Cerrar remisión**. Una remisión por turno se cierra desde su propio turno. Una diaria se cierra desde un turno de la misma fecha que sea único o tarde-noche; no desde el turno de mañana.

Cerrar la remisión genera una cuenta por pagar del Restaurante al proveedor **Panadería (remisiones)** por el total completo y bloquea nuevas entregas en ese documento. No cierra el turno de caja ni modifica de nuevo el stock. Una remisión diaria cerrada no admite más entregas de esa fecha: completa las entregas antes de cerrarla.

## Pagar y confirmar el ingreso

1. El cajero o administrador local de Restaurante abre su turno, selecciona la remisión cerrada y registra el **pago completo** con el método acordado: efectivo o transferencia. Las remisiones no admiten abonos ni pagos parciales.
2. Una vez registrado el pago completo, el cajero o administrador local de Panadería abre su turno y pulsa **Confirmar ingreso** en la remisión.
3. El ingreso se confirma **exactamente una vez**. Si fue en efectivo, se registra el ingreso en el turno de Panadería y aumenta su efectivo esperado. Si fue transferencia, se conserva el método para conciliación sin aumentar el efectivo físico esperado.

El estado de pago de Restaurante y la confirmación de ingreso de Panadería son pasos distintos. Si aparece que Restaurante aún debe pagar, registra allí el pago completo antes de confirmar el ingreso. Si ya se confirmó, no crees un movimiento manual adicional por la misma remisión.

## Conservar traslados y recepciones anteriores

En Remisiones, **Entradas desde restaurante y traslados anteriores** conserva el acceso al flujo anterior y su historial. No recrees esos documentos como remisiones nuevas ni reimportes su stock.

Para enviar ingredientes de Restaurante a Panadería, conserva el flujo de traslado: Restaurante solo envía ingredientes con stock disponible. En Panadería, el panadero o administrador confirma la recepción pendiente en Inventario. El destino es un insumo no vendible de la misma unidad y conserva fracciones cuando corresponde. Esta recepción es distinta de la entrega de productos de Panadería a Restaurante.

## Comprobantes y facturación fiscal

Los comprobantes de venta y las remisiones son documentos internos de operación. Sigue pendiente confirmar si ambas áreas usan el mismo NIT y qué numeración fiscal corresponde a cada una. No los presentes como facturas fiscales hasta resolverlo.
