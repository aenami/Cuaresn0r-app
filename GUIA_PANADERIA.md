# Operacion inicial de panaderia

La panaderia comparte la plataforma con restaurante/cafeteria, pero no su
inventario ni su caja. Un administrador puede entrar a las dos vistas. Al
crear o editar un cajero, el administrador debe asignarlo a una sola area;
los cajeros existentes quedan inicialmente en restaurante y deben volver a
iniciar sesion si se les cambia el area.

## Preparacion

1. La migracion `20260924190000_panaderia_separada` ya se aplico en la base
   local `POS` tras un respaldo en `server/backups/`. Para otro ambiente,
   respaldar primero y ejecutar `pnpm exec prisma migrate deploy` desde
   `server/`. No usar `migrate reset` ni `migrate dev` sobre `POS`: conserva
   cuatro migraciones historicas ausentes en el repositorio.
2. Crear la caja de panaderia desde **Panaderia → Caja y cuadre**.
3. Crear los panes y bebidas en **Inventario y conteo** con su precio de
   venta. La existencia inicial se registra como entrada, con concepto.
4. Crear `INSUMO` para ingredientes que panaderia recibe de restaurante.
   Debe tener la misma unidad del ingrediente origen (`kg`, `g`, `L`, etc.).
   Un insumo no aparece en el mostrador ni se vende.
5. Asignar el area `PANADERIA` a los cajeros correspondientes.

## Jornada

- Abrir turno de panaderia. La base de caja es 300.000 COP y se mantiene
  separada de la caja de restaurante.
- Registrar hornadas y recepciones como entradas. Las ventas de mostrador
  descuentan existencia, guardan el precio al momento de la venta y aceptan
  efectivo, transferencia y tarjeta en combinacion.
- En el cierre contar fisicamente todos los articulos activos. La tabla
  compara lo que habia al inicio mas entradas, las ventas registradas, las
  salidas justificadas y el saldo fisico. Una diferencia se valora para
  investigacion; **no se registra automaticamente como venta ni cobro**.
- Los turnos `TARDE_NOCHE` y `UNICO` no se pueden cerrar hasta terminar el
  conteo. Si hay un movimiento posterior, se debe recontar.

## Traslados entre areas

- **Panaderia → restaurante:** un administrador elige articulo, producto
  o ingrediente de destino, cantidad, precio unitario y concepto. La salida
  descuenta panaderia y crea la cuenta `TR-PAN-id` en restaurante. Restaurante
  confirma la recepcion; despues registra el pago en su cuenta por pagar.
  Panaderia confirma la entrada de ese dinero en su propia caja.
- **Restaurante → panaderia:** desde **Traslados** un administrador elige
  ingrediente con stock, insumo de igual unidad, cantidad (se permiten
  fracciones), precio y concepto. La salida descuenta restaurante y crea
  `TR-RES-id`. Panaderia confirma la recepcion, paga desde su turno en
  efectivo o por transferencia, y restaurante confirma el ingreso.
- No se reutilizan existencias en el otro area antes de confirmar la
  recepcion. Los pagos no se registran automaticamente al crear el traslado.

## Limites antes de puesta en marcha

- Confirmar el NIT y la numeracion fiscal de cada area. Los comprobantes
  actuales de panaderia y traslados son internos; falta la facturacion
  fiscal y la impresion correspondiente.
- Probar con operaciones reales y saldos de apertura validados por los
  dueños antes de migrar a produccion.
