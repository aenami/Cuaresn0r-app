# Contingencia manual sin Internet

Aplica a Panadería y Restaurante. No es un modo offline de la aplicación:
la API, el stock compartido y la cola de impresión necesitan conexión.
Mantén esta guía y los formatos impresos en cada caja, no solo en la nube.

Formatos para imprimir en A4, al 100% y diligenciar a mano:
[pedidos, ventas y control de conciliación](../output/pdf/CONTINGENCIA_POS.pdf).
Imprime copias de cada página; agrega hojas de continuación conservando el folio.

## Preparación antes de abrir

- Un talonario por área, bolígrafo y copia impresa del catálogo con precios,
  recetas/alternativas del Ejecutivo y Bandeja, y teléfonos de contacto.
- Usa folios únicos: `REST-AAAAMMDD-0001` y `PAN-AAAAMMDD-0001`. La numeración
  sigue durante todos los turnos de ese día. Conserva también los anulados.
- Designa al cajero responsable del talonario y al administrador local que
  verificará la conciliación. El administrador global no cobra ni opera caja.
- Ten a mano la lista de fichas disponibles y el último inventario conocido.
  Una copia antigua de stock es orientativa: confirma físicamente lo disponible.
- Imprime suficientes hojas del PDF adjunto. No esperes al corte para hacerlo.

## 1. Confirmar el corte y abrir la contingencia

1. Revisa la conexión y, si está autorizado, prueba un enlace alternativo.
   Si la conexión no vuelve pronto, el cajero declara el inicio manual y anota
   hora, área, turno, responsable y último pedido/venta confirmado en el POS.
2. Si una operación quedó cargando, **no la repitas ni vuelvas a cobrar**.
   Márcala como «POS por verificar» y anota el pedido/folio visible. Al volver
   la conexión comprueba si el servidor ya la registró.
3. Informa a quienes toman pedidos, preparan y entregan. Trabaja en papel hasta
   que el cajero declare el retorno; no alternes papel y POS sin coordinación.
4. La contingencia no se registra como un turno nuevo. Si no se pudo abrir el
   turno en POS, conserva el formato manual y la base recibida para resolverlo
   con el administrador local cuando haya conexión.

## 2. Registrar y atender

### Restaurante

1. Escribe un folio por pedido, hora, responsable y cuenta/cliente de cada línea.
   Anota producto, cantidad, precio unitario, subtotal y observaciones. Para
   Ejecutivo/Bandeja indica las elecciones; Bandeja no lleva caldo.
2. Se conserva la regla de pago previo. Cajero o administrador local puede
   autorizar preparar sin pago; deja marcada la autorización y quién la dio.
   No necesitas inventar un motivo. Registra aparte lo pagado y lo pendiente.
3. Asigna una ficha libre al cobrar o al autorizar, según el flujo habitual.
   No reutilices una ficha mientras tenga productos pendientes de entregar.
   Una ficha no es el folio: puede reutilizarse después para otro pedido.
4. Envía una copia escrita de la comanda a cocina/barra. Marca qué líneas se
   enviaron y su hora; las adiciones usan el mismo folio y una nueva ronda.
5. Marca la entrega de cada línea con cantidad y hora. Cuando se entregue todo,
   el pedido queda cerrado para adiciones y la ficha se libera. Un nuevo pedido
   recibe otro folio y ficha disponible.
6. Para panes compartidos, confirma físicamente con Panadería antes de ofrecer.
   Ambas áreas anotan la reserva/entrega y el mismo folio de remisión manual.
   No supongas que el stock mostrado antes del corte sigue disponible.

### Panadería

1. Un folio por venta de mostrador. Anota producto del catálogo, cantidad, precio
   y total. Si no hay existencias suficientes, no vendas lo que no puedes entregar.
2. Registra el desglose de pagos, efectivo recibido y cambio entregado. Los
   pagos digitales no se mezclan con efectivo ni se cuentan como dos ingresos.
3. Hornadas, entradas de proveedor, mermas y entregas a Restaurante se anotan
   por separado con artículo, cantidad, unidad, hora, responsable y motivo.
   Una hornada debe registrarse posteriormente una sola vez, con su receta.
4. Agrupa las remisiones de varias líneas según la modalidad vigente del día
   o turno. Las mercancías transferidas no son una venta al público de Panadería.

### Pagos y salidas de caja de ambas áreas

- Anota cada pago por método: efectivo, Nequi/transferencia o tarjeta. Verifica
  las transferencias por un canal fiable disponible; una captura del cliente
  no basta para afirmar que se recibió dinero. Si no puedes verificar, registra
  «digital por verificar»; no lo marques confirmado ni cobres de nuevo sin revisar.
- En efectivo: importe aplicado + cambio = dinero recibido. Ejemplo: venta de
  $18.000, recibe $20.000 y entrega $2.000; el ingreso neto es $18.000.
- Pagos a empleados, proveedores y otros egresos llevan nombre, concepto,
  importe, método, soporte y folio. Una factura pendiente es informativa hasta
  que se efectúe su pago. No vuelvas a pagar al transcribirla.
- Separa por área y turno. La base de $300.000 se cuenta físicamente, pero no
  es venta ni ganancia; anota también retiros al cambio de turno.
- Corrige tachando una sola vez, escribiendo el valor correcto y firmando.
  No borres hojas, folios ni registros anulados. Protege los datos del cliente.

## 3. Volver al POS sin duplicar

1. El cajero comprueba que la conexión es estable y fija hora y último folio
   manual. Las nuevas operaciones vuelven al POS; se apartan las hojas pendientes.
2. Primero revisa las operaciones «POS por verificar». Busca pedidos, cuentas
   cobradas y pagos del turno. Si ya existen, vincula su ID al folio; no los crees
   otra vez. Si el resultado es incierto, lo revisa el administrador local.
3. Revisa cada folio y marca **una única situación**: ya existe en POS, pendiente
   de registrar, anulado o requiere revisión. El folio y el ID son el control de
   duplicados; esta conciliación manual no tiene importación automática.
4. Registra en el mismo turno abierto y fecha de negocio cuando el sistema lo
   permita. Usa los comentarios de las cuentas de Restaurante para el folio,
   hora real y observaciones. En Panadería conserva la hoja de control que liga
   folio y venta, aunque el formulario de venta no tenga campo de comentario.
5. Registra primero las hornadas y entradas físicas pendientes, y revisa las
   reservas/remisiones antes de las ventas que las consumen. Después transcribe
   los pedidos y pagos que **todavía no están** en el sistema. El precio cobrado
   manda para la conciliación: si cambió el catálogo o no coincide el total,
   no lo sustituyas silenciosamente; pide revisión al administrador local.
6. Un pedido manual ya preparado/entregado requiere especial cuidado: la acción
   **Enviar a cocina** descuenta recetas y agenda impresión automáticamente.
   Avisar «REGISTRO DE CONTINGENCIA - NO PREPARAR» y verificar la cola evita
   cocinar dos veces; no desconectes el agente confiando en que se borra la cola.
   No hagas a la vez una salida manual y el consumo automático de esa receta.
7. Para panes compartidos, la entrega POS crea su remisión automáticamente.
   **No dupliques** esa misma entrega creando también una remisión manual en POS.
   Si la entrega ocurrió sin turno de Panadería abierto, o la reserva/stock no
   permite reconstruirla, conserva ambos soportes y deja el caso pendiente de
   revisión: no inventes hornadas ni existencias para forzar el registro.
8. Si se deben registrar pagos con una cuenta ya cobrada, aplica solo el importe
   faltante confirmado. No marques como recibido un digital aún sin verificar.
9. Si el corte cruza medianoche o el turno ya se cerró, **no cambies fechas del
   computador, no reabras turnos ni edites SQL**. El POS no tiene importación
   retroactiva de contingencias. El administrador local documenta la incidencia
   y concilia los soportes antes de interpretar los reportes de esa fecha.

## 4. Conciliar y cerrar

- Por folio compara total vendido, pagos confirmados, saldo pendiente, entregas
  y su ID de POS. Un folio no se marca conciliado solo por haber creado el pedido.
- Suma ventas manuales ya incorporadas al POS **una sola vez**. No registres un
  movimiento «ingreso por contingencia» adicional a esos pagos: duplicaría la caja.
- Verifica egresos contra cuentas por pagar/nómina antes de registrarlos; algunos
  pagos generan automáticamente su movimiento de caja.
- Contrasta movimientos físicos, hornadas, recetas y remisiones con el conteo.
  Un pedido no registrado puede parecer faltante: no lo clasifiques como pérdida
  definitiva hasta conciliar. Tras los movimientos pendientes, vuelve a contar si
  se requiere. Cierra el turno único/tarde-noche solo con el conteo completo.
- Si hay un cierre manual sin Internet, escribe efectivo contado con base, digital
  confirmado, digital pendiente, egresos y retiros. El cierre manual queda
  provisional hasta la revisión. No finjas que el cierre POS ya se realizó.
- Firman cajero y administrador local: folios usados/anulados, pendientes, ventas
  por método, egresos, diferencias, hora de conciliación. Conserva hojas en archivo
  privado y anexa una copia al expediente del turno; no las publiques en GitHub.

## Simulacro recomendado

Sin desconectar la operación real, simula cinco casos: venta de Panadería con
cambio, pedido por dos cuentas con pago mixto, Ejecutivo con elecciones,
operación que quedó cargando y pan compartido con remisión. Comprueba que cada
folio termina vinculado una sola vez y que dinero, entregas y stock concuerdan.
Haz el primer simulacro con ambos cajeros y repítelo al cambiar el personal.

Este procedimiento conserva trazabilidad en papel. Para automatizar la
transcripción sin reimprimir, con fecha original e idempotencia, haría falta un
flujo específico adicional en el POS; no se supone que ya existe.
