# Progreso del proyecto

Este archivo registra el estado funcional y las decisiones tomadas al adaptar el
template POS al restaurante objetivo. Debe actualizarse junto con cada cambio de
alcance o feature terminada.

## Contexto actual

- El repositorio parte de un template POS para restaurante.
- Ahora contempla restaurante/cafetería y panadería con datos propios. Los
  administradores locales y trabajadores pertenecen a una sola área; el
  administrador global supervisa ambas, sin cobrar ni operar caja.
- La reestructuracion hacia el restaurante especifico esta implementada en el
  codigo y pendiente de despliegue/configuracion operativa.
- Las migraciones de la adaptación operativa son
  `server/prisma/migrations/20260901090000_restructuracion_restaurante` y
  `server/prisma/migrations/20260901102500_trazabilidad_y_modalidad_cuenta`.

## Convenciones de trabajo

- Cada avance terminado debe quedar registrado en commits funcionales y
  descriptivos antes de iniciar el siguiente bloque de trabajo.
- Los commits usan exclusivamente la identidad Git configurada por el
  propietario del repositorio y no incluyen firmas ni coautorias adicionales.

## Completado

### 2026-10-09 — Filtros de proveedores y asistencia por horarios completos

- Proveedores y cuentas, en ambas áreas, permite filtrar Todas, Pendientes y
  Pagadas, y combinar fechas de emisión desde/hasta, inclusivas. Pendientes
  incluye cuentas con abonos parciales. Se puede limpiar la selección y se
  informan rangos inválidos o resultados vacíos; el detalle y las acciones
  siempre pertenecen a una cuenta visible en el filtro actual. Las cuentas
  pagadas muestran su importe, no un saldo cero como único valor.
- Se corrigió el estado «Mercancía recibida y registrada»: texto verde claro
  sobre fondo oscuro, icono y contraste medido 10,66:1. Emisión y vencimiento
  conservan el día de la columna Date sin desplazarse por la zona horaria.
  La lista también respeta el ancho de pantallas móviles.
- Asistencia sustituye reloj, marcación en vivo y acciones de entrada/salida
  por un formulario modal de trabajador y horarios. Permite varios tramos por
  día, muestra automáticamente su duración sin sumar descansos y admite
  horarios que cruzan medianoche mediante «Día siguiente». Se pueden consultar
  fechas anteriores y completar jornadas antiguas abiertas; no se borra su
  historia. Se consultan solo las jornadas de la fecha elegida y las abiertas,
  en paralelo, sin descargar todo el historial para registrar un día.
- Confirmar guarda todos los tramos y liquida horas, recargo configurado y
  conceptos automáticos en una misma transacción. Se validan futuros,
  superposiciones, fecha inicial de Colombia y duración máxima de 24 horas.
  Un reintento idéntico no duplica ni recalcula devengos. Editar un horario
  confirmado usa las reglas existentes de reapertura y solo se permite si no
  tiene pagos aplicados; pagos y correcciones comparten bloqueo del empleado.
  Los permisos y la separación Panadería/Restaurante no se amplían.
- Las rutas antiguas de marcación se conservan para compatibilidad, sin
  controles en la nueva interfaz. No se requiere migración ni se modifican
  jornadas, tarifas o pagos existentes durante el despliegue.
- Verificación: 32 suites/467 pruebas del servidor, compilaciones de cliente y
  servidor y lint del cliente. Integración con PostgreSQL en ambas áreas:
  horarios partidos, liquidación, reintento, corrección, bloqueo de pagos,
  recargo nocturno y falta de tarifa; todo el dato temporal se revirtió.
  Chromium validó filtros/fechas, estados vacíos y detalle coherente, contraste,
  duración, validaciones y reintento de formulario en escritorio/móvil, sin
  errores de JavaScript ni desbordamiento. Confirmaciones de UI simuladas,
  sin agregar nómina a la base.

### 2026-10-09 — Mostrador por teclado, conteos compactos y muestra operativa

- Panadería: el mostrador permite recorrer productos disponibles con las cuatro
  flechas, agregarlos con Enter, volver al buscador con Escape y abrir el cobro
  con F2. Después de vender se limpian carrito, pagos y búsqueda y se enfoca
  automáticamente el buscador. El cobro se realiza en modal; admite efectivo
  recibido y devuelta automática, sin contabilizar el billete completo como
  ingreso. Se conservan pagos mixtos, validación e idempotencia de reintentos.
- Cuentas de Panadería incorpora consulta por fecha de Colombia, separación
  por turno, indicadores diarios y detalle de productos/pagos. El servidor
  consulta todo el día, sin truncar a las últimas 100 ventas. El comprobante
  imprimible es un recibo interno, no factura fiscal ni envío al agente USB;
  esa diferencia con Restaurante y la definición fiscal quedan explícitas.
  Flujo de caja de Panadería excluye ventas del registro de movimientos y su
  filtro, manteniendo intactos los indicadores de ingresos y efectivo esperado.
- Ambas áreas tienen buscador de productos/ingredientes en el conteo, incluidos
  historial y vista futura. Restaurante tiene tarjetas compactas con detalles
  secundarios desplegables y diferencias/valoración siempre visibles. Las
  fechas futuras continúan siendo de solo lectura.
- Los formularios de Panadería de ingredientes, movimientos, conteos, recetas,
  metas, hornadas, remisiones y apertura de caja ahora usan modales. El formato
  principal del cuadre conserva su página de trabajo. La guía de interfaz
  aplicada conserva la identidad visual y prioriza foco, teclado y densidad.
- Se cargó una muestra aditiva en el **POS local**, con prefijo `[MUESTRA]`:
  18 artículos de Panadería, 42 ventas de mostrador, 28 cuentas de Restaurante,
  28 turnos cerrados, 133 conteos históricos y 8 hojas de producción; incluye
  recetas, nómina, proveedores, metas, pagos mixtos y 3 remisiones. Período
  02–08/10/2026; ingresos estimados de productos contados $1.621.800 y pérdidas
  estimadas $19.500. No se cambiaron usuarios ni turnos abiertos existentes.
- Respaldo privado validado con `pg_restore`: `server/backups/POS-antes-muestra-20261009.dump`.
  Script local protegido e idempotente: `server/scripts/seed-showcase-local.cjs`.
  Recorrido y escenarios en `docs/GUIA_DEMOSTRACION.md`. Neon no recibió datos
  de muestra; esta funcionalidad no requiere una nueva migración.
- Verificación: compilaciones de cliente/servidor, lint del cliente sin avisos,
  30 suites/432 pruebas del servidor y validación de coherencia de datos con
  Prisma. Chromium comprobó cuatro flechas, Enter/F2, devuelta, pago mixto y
  digital, reintento idempotente, reinicio/foco, cuentas por turno y recibo,
  búsqueda histórica/futura, análisis y modales en escritorio/móvil sin
  errores de JavaScript ni desbordamiento. Cobros de QA simulados, sin ventas
  reales adicionales.
- Publicación solicitada junto con los commits acumulados anteriores. La
  prueba física de impresoras y la definición fiscal siguen pendientes.

### 2026-09-23 — Conteo obligatorio al cierre y conciliación por entregas

- Al abrir caja se selecciona obligatoriamente Mañana, Tarde-noche o Turno único.
  Mañana no exige inventario; los otros dos requieren todos los elementos del
  conteo finalizados. La comprobación está en el servidor, también para ADMIN,
  y detecta elementos de la lista fija que todavía no tienen registro diario.
- Los turnos antiguos conservan tipo nulo; si aún están abiertos deben
  clasificarse al cerrarlos. No se pueden reclasificar turnos nuevos desde el
  cierre para evadir el requisito. Lista vacía bloquea el cierre requerido.
- Se registra `fecha_entrega_dc` al entregar individualmente o por comanda,
  sin cambiarla en reintentos. El conteo compara salida física (saldo anterior
  + entradas recibidas/producción - físico) contra unidades ENTREGADAS,
  independientemente del pago. Los componentes de combos cuentan por producto.
- Para ingredientes se suman los movimientos SALIDA_RECETA originales, sin
  reversos, correspondientes a productos entregados; no se recalcula con la
  receta actual ni se cambia el descuento de stock que ocurre al preparar.
- La pantalla muestra coincidencia, faltante o sobrante y advierte que mermas,
  ajustes u omisiones pueden explicar diferencias. No ajusta stock automáticamente.
  Las inconsistencias informan, pero no impiden cerrar cuando se completó el conteo.
- Entregas posteriores a la confirmación requieren reabrir y volver a contar
  el elemento antes de cerrar. Durante la confirmación del cuadre se estabilizan
  lista, conteos y entregas con bloqueo transaccional; se conserva una fotografía
  de la conciliación en el turno para consulta histórica.
- Fechas diarias en Colombia (UTC-5, 00:00 a 24:00). El turno exige el conteo de
  su fecha de apertura; no se agrupan entregas de otro día calendario. Los
  registros anteriores sin fecha de entrega no reciben fechas inventadas;
  días con esos registros o con saltos desde el saldo anterior muestran que no
  son comparables, en lugar de anunciar una coincidencia falsa.
- Migración `20260922180000_cierre_conteo_entregas` aplicada en PostgreSQL local,
  con copia previa en `server/backups/POS-before-delivery-count-1790134125773.dump`.
  No se modificó la base de producción.
- Verificación: suite completa de 176 pruebas del servidor, compilación de ambos
  proyectos, lint del cliente y prueba PostgreSQL con rollback (bloqueo sin
  conteo, entregas sin pagos, exclusión de preparados/cancelados, reconteo y
  cierre con discrepancia). Prueba Chromium con API simulada: selección de
  turno, bloqueo/habilitación del cierre y faltante visible en escritorio/móvil.
- Implementación local; pendiente publicar y ejecutar la migración en producción.

### 2026-09-22 — Lista fija de conteo y retiro de pendientes del día

- La selección es una configuración permanente, creada una sola vez y editable
  por el administrador; se aclararon los textos como «lista fija».
- Retirar un producto o ingrediente desactiva su inclusión futura y elimina
  únicamente su conteo pendiente de hoy (fecha de Colombia), sin cantidad física
  confirmada. Los registros de días anteriores y los finalizados se conservan.
- El retiro y la preparación automática usan transacciones y un bloqueo común
  para evitar que otra pantalla vuelva a crear un elemento recién retirado.
- Verificación: 16 pruebas unitarias, compilaciones de servidor y cliente y lint
  del cliente. Prueba local con PostgreSQL de retiro, reinclusión, saldo anterior,
  persistencia entre días y conservación de pendientes históricos y confirmados;
  todos los datos de prueba se revirtieron. No requiere nueva migración.
- Cambio local; publicación en producción pendiente.

### 2026-09-22 — Evitar cierre accidental de formularios al descartar selectores

- El componente compartido `DialogContent` evita el cierre por clic o toque fuera
  del diálogo, preservando los datos al descartar un selector sin elegir opción.
- Se mantienen los cierres explícitos mediante X, Cancelar y Escape. Con un
  selector abierto, el primer Escape cierra el selector y el siguiente el diálogo.
- Validación en Chromium con Playwright sobre lista diaria e ingreso de ingredientes:
  clic fuera del selector dentro y fuera del formulario, conservación de valores,
  selección de opciones, Escape y X. API simulada, sin crear registros reales.
- Compilación de producción y lint del cliente correctos.

### 2026-09-20 — Lista fija para el conteo diario de inventario

- El administrador configura una lista permanente de productos e ingredientes
  desde «Configurar lista diaria». Los trabajadores solo ingresan el conteo físico.
- Al abrir la jornada actual se crean automáticamente los pendientes que falten,
  sin duplicados al volver a entrar o acceder desde varios equipos. La fecha
  operativa se calcula en America/Bogota tanto en el cliente como en el servidor.
- El saldo se toma del último cierre finalizado; el saldo inicial se pide una
  sola vez cuando no existe historial. Se mantienen entradas y cálculos actuales.
- Retirar un elemento de la lista lo desactiva para nuevas jornadas; conserva
  todos los conteos ya creados. Los productos deshabilitados no generan pendientes.
- Consultar fechas pasadas o futuras no genera registros retroactivos.
- Migración `20260920120000_elementos_fijos_conteo`: nueva configuración persistente
  con relaciones a productos/ingredientes; importa la selección de la última
  jornada registrada como lista inicial sin modificar sus conteos.
- Migración aplicada localmente tras respaldo en `server/backups/`. Para producción
  se aplicará mediante `prisma migrate deploy` en el despliegue del servidor.
- Validación: 14 pruebas del servicio, compilaciones de servidor y cliente, lint
  del cliente y prueba contra PostgreSQL real de creación, cierre, arrastre al día
  siguiente, retiro e historial. Los datos de esa prueba se revirtieron al terminar.

### 2026-09-18 — Buscador en la toma de pedidos

- Buscador por nombre en el menú, enfocado automáticamente al entrar a un pedido.
- Filtrado inmediato dentro de la categoría seleccionada, incluidos los combos
  en su pestaña; ignora mayúsculas y tildes y permite buscar varias palabras.
- Botón para limpiar y volver a escribir, y mensaje cuando no hay coincidencias.
- Al cambiar de pedido se reinicia el buscador y recupera el foco; funciona
  tanto para pedidos generales como para la modalidad por cuenta.
- Validación: compilación de producción y lint del cliente completados.

### 2026-09-01 — Trazabilidad financiera y pedidos por cliente

- Cuentas por pagar:
  - Se separaron la fecha de emisión del documento, la fecha real de registro,
    la última actualización y la fecha en que se terminó de pagar.
  - El detalle muestra un historial cronológico con recepción de mercancía,
    cada pago parcial, método, usuario, turno y caja, además del pago total.
  - El formulario permite registrar una fecha de emisión histórica sin perder
    la fecha en que el dato ingresó al sistema.
- Comandas autorizadas antes del pago:
  - La autorización original se conserva como auditoría.
  - Al saldar todos los productos de la ronda se registra automáticamente la
    fecha de regularización y desaparecen tanto el aviso de pago pendiente como
    la acción de cobrar un pedido completamente pagado.
  - Si posteriormente se anula la factura, la ronda vuelve a quedar marcada
    como pendiente de regularización.
- Pedidos por cuenta:
  - Un pedido local puede abrirse como cuenta única o `POR_CUENTA`.
  - En modo por cuenta se crean los clientes desde el inicio y el trabajador
    elige la cuenta activa antes de agregar productos; cada producto queda
    asociado a ese cliente desde su creación.
  - Se validan nombres vacíos, repetidos y el máximo de 20 cuentas iniciales.
- Cuentas cobradas:
  - El día del reporte y el turno se atribuyen al pago final que saldó la
    factura, incluso cuando los pagos parciales ocurrieron en turnos distintos.
  - La pantalla incorpora un interruptor para separar las ventas por turno,
    mostrando caja, cajero, apertura, cierre, número de cuentas y total.
- La migración fue respaldada y aplicada en la base local `POS`; las 17
  migraciones están al día y las cuentas existentes quedaron con sus fechas de
  trazabilidad completas.

### 2026-09-01 — Configuración local de PostgreSQL

- Se añadió `server/.env` para el desarrollo local con la conexión de PostgreSQL
  por defecto (`postgresql://postgres:postgres@localhost:5432/pos`). Si la
  instalación local usa otras credenciales, debe ajustarse solo ese valor.
- `PrismaService` ahora valida `DATABASE_URL` al iniciar y devuelve una
  instrucción concreta si falta, en lugar de propagar el error interno
  `SASL: client password must be a string`.
- La migración `20260901090000_restructuracion_restaurante` quedó aplicada en
  la base local `POS`. Se conservó la tabla `Proveedor` heredada y sus dos
  registros; la migración ahora reutiliza esa tabla y es atómica.
- Antes de migrar se creó un respaldo local en `server/backups/`, directorio
  excluido de Git por contener datos de la base.
- Verificación posterior: Prisma reporta las 16 migraciones al día; schema
  válido; consultas ORM a usuarios, proveedores, fichas, cuentas por pagar y
  trabajos de impresión correctas; backend compilado; inicio completo de Nest
  y login local aprobados (HTTP 200/201); 15 suites/122 pruebas aprobadas.

### 2026-08-31 — Preparacion para la reestructuracion

- Se reviso la arquitectura y el dominio completo del template.
- Se descarto definitivamente el rol `COCINERO`; no se implementara.
- Se completo la proteccion del ultimo administrador activo en los tres puntos
  que pueden retirarle acceso:
  - cambiar su rol a uno no administrativo;
  - eliminar su usuario;
  - desactivar su empleado.
- La proteccion serializa esas operaciones en PostgreSQL para cubrir tambien
  solicitudes concurrentes.
- Se agregaron/actualizaron pruebas unitarias de usuarios y empleados.
- Validacion: 14 suites y 118 pruebas del backend aprobadas; TypeScript y
  formato de los archivos modificados aprobados.

### 2026-09-01 — Reestructuracion operativa del restaurante

- Pedidos locales:
  - Las fichas sustituyen las mesas para identificar pedidos locales.
  - Un pedido LOCAL inicia sin ficha; se puede guardar como comanda BORRADOR
    mientras se toma el pedido.
  - CAJERO o ADMIN pueden enviar una comanda sin pagar. La accion queda
    auditada y la ficha es opcional en esa excepcion.
  - El flujo normal exige pago y ficha antes de enviar a preparacion.
  - Al entregar todos los productos, el pedido queda permanentemente cerrado
    para nuevas adiciones. La ficha queda reutilizable solo cuando tambien se
    encuentra completamente pagado; el siguiente consumo es otro pedido.
  - ADMIN puede crear, renumerar, activar y desactivar fichas. No se puede
    desactivar una ficha ocupada.
- Facturacion y cuentas:
  - Se preservan subcuentas, repartos proporcionales y pagos mixtos.
  - `FacturaDetalle` congela los productos y proporciones de cada factura;
    los productos pagados no se pueden modificar ni cancelar. Las correcciones
    son anulacion y nueva factura.
  - Se agregaron comentarios/resoluciones por subcuenta para recordatorios,
    por ejemplo un cambio pendiente para un cliente.
- Inventario y proveedores:
  - Ingredientes admiten umbral bajo y alto opcionales, con estados
    informativos agotado/bajo/ideal/alto/sin umbrales.
  - Se implementaron proveedores y cuentas por pagar con vencimiento, saldo,
    pagos parciales y pago por efectivo o transferencia.
  - La entrada de inventario de una compra ocurre exclusivamente al confirmar
    la recepcion fisica de la mercancia.
- Cuadre de caja:
  - Todo turno abre con base fija de 300.000 COP.
  - El efectivo esperado solo incluye efectivo fisico; las transferencias se
    reportan separadamente (ventas, egresos de nomina/proveedores y neto).
- Impresion:
  - La arquitectura es servidor -> cola persistente -> agente local Windows
    -> USB/ESC-POS. El agente es para la caja, incluye instalacion al inicio de
    Windows y reintentos por desconexion/falta de papel.
  - Se soporta Epson TM-m30II para factura, cocina/barra compartida y una
    futura tercera impresora por destino.
- Interfaz:
  - El tablero antes llamado Mesas ahora opera como “Pedidos y fichas”.
  - Se agregaron pantallas de fichas, cuentas por pagar, comentarios de cuenta,
    umbrales de ingredientes y conciliacion de transferencias en caja.
  - Los reportes y las vistas de facturas cobradas usan la ficha y el detalle
    exacto congelado en la factura; no vuelven a inferir productos desde una
    mesa o desde rondas agregadas posteriormente.
- Validacion de codigo: schema Prisma valido y cliente generado; compilacion
  de servidor y cliente aprobada; 16 suites/130 pruebas unitarias aprobadas.

### 2026-09-01 — Plan diario de produccion

- Inventario abre ahora en una hoja de preparacion diaria navegable por fecha.
- ADMIN puede agregar una unica meta por producto o ingrediente para cada dia;
  los productos exigen unidades enteras y los ingredientes conservan su unidad
  y admiten hasta cuatro decimales.
- Las metas solo se resuelven completas como `PRODUCIDO` o `NO_PRODUCIDO`.
  Cualquier trabajador autenticado puede confirmar una meta pendiente una sola
  vez; solo ADMIN puede corregir o reabrir una decision ya registrada.
- La produccion es informativa y no genera movimientos de inventario
  automaticamente. La base de datos tambien impide cantidades no positivas,
  productos fraccionados, objetivos ambiguos y duplicados por fecha.
- Se conserva quien creo y quien resolvio cada meta, junto con la hora de
  resolucion y una copia del nombre/unidad del objetivo para el historial.
- Los estados de stock ya tienen color semantico: agotado rojo, bajo ambar,
  ideal verde, alto azul y sin umbrales neutro.
- Se aplico la migracion `20260901130000_plan_produccion_diaria` en la base
  local `POS`, previo respaldo en `server/backups/`. Prisma reporta 18
  migraciones al dia; 17 suites/139 pruebas, compilaciones y lint aprobados.

### 2026-09-01 — Correccion de creacion de metas de produccion

- Se retiro del esquema Prisma una relacion accidental entre
  `PlanProduccionDiaria` y `Combo`. La funcionalidad solo admite productos e
  ingredientes y la migracion aplicada nunca creo `comboId_combo`, por lo que
  el cliente generado intentaba consultar una columna inexistente (`P2022`).
- No fue necesaria una migracion adicional: la estructura existente en
  PostgreSQL era la correcta. Se regenero Prisma Client y se comprobo una
  creacion real dentro de una transaccion revertida, sin conservar datos de
  prueba. Las 17 suites/139 pruebas y la compilacion del servidor aprobaron.

### 2026-09-08 — Cuadre de caja por turno

- Caja incorpora una seccion propia de `Cuadre`, separada del registro de
  movimientos. El formato se alimenta automaticamente con las ventas y pagos
  que ya existen en el sistema, evitando que el cajero los vuelva a escribir.
- El cuadre detalla por turno los pagos a empleados y proveedores con nombre,
  concepto, medio de pago y valor. Los pagos de nomina por transferencia ahora
  quedan asociados al turno abierto, sin afectar el efectivo fisico.
- Nequi se concilia como saldo digital separado: se muestran los ingresos por
  ventas, los pagos digitales y el neto, pero ninguno aumenta el dinero
  esperado dentro del cajon.
- El conteo muestra efectivo esperado y real tanto incluyendo como excluyendo
  la base fija de 300.000 COP. La diferencia entre contado y esperado determina
  si la caja quedo exacta, con sobrante o con faltante.
- Las cuentas por pagar pendientes son informativas y no disminuyen el efectivo
  hasta pagarse. Al cerrar el turno se congela en JSON su proveedor, concepto,
  documento, vencimiento y saldo para que el cuadre historico no cambie luego.
- Se agrego un historial navegable de turnos cerrados. Los turnos anteriores a
  esta mejora conservan sus cifras, pero indican que no disponen de fotografia
  historica de facturas pendientes.
- Se aplico la migracion `20260908120000_cuadre_caja_por_turno` en la base local
  `POS`, previo respaldo en `server/backups/`. Prisma reporta 19 migraciones al
  dia; 18 suites/142 pruebas, compilaciones y lint aprobaron.

### 2026-09-14 — Conteo fisico diario de inventario

- Inventario incorpora la pestaña `Conteo diario`, navegable por fecha y
  disponible para cualquier trabajador autenticado. Cada hoja permite elegir
  solo los productos e ingredientes que requieren verificacion al cierre.
- Cada elemento conserva el ultimo conteo fisico finalizado como saldo
  anterior. En el primer registro se solicita un saldo inicial; los dias
  siguientes lo heredan automaticamente junto con la fecha de ese cierre.
- Las entradas del dia se calculan sin duplicarlas:
  - para ingredientes se toman los movimientos `ENTRADA`, incluidas las
    recepciones confirmadas de proveedores;
  - para productos se toman las lineas de cuentas por pagar cuya mercancia fue
    recibida;
  - las metas diarias marcadas `PRODUCIDO` tambien se suman como produccion
    terminada del producto o ingrediente.
- La salida aparente se congela al confirmar mediante la formula `saldo
  anterior + entradas - conteo fisico`. En productos se presenta como venta
  calculada y en ingredientes como consumo calculado. Un resultado negativo no
  se oculta: queda resaltado como produccion o entrada pendiente de explicar.
- Para ingredientes se conserva ademas una fotografia del stock automatico al
  cerrar y se muestra su diferencia frente al conteo fisico. El conteo manual
  es informativo y no altera existencias automaticamente.
- El cierre registra trabajador y hora. Solo ADMIN puede reabrir o retirar un
  conteo; un cierre no se puede reabrir si ya alimenta un dia posterior, para
  no romper la cadena historica.
- Las cuentas por pagar ahora admiten lineas de productos terminados ademas de
  ingredientes. La recepcion puede confirmarse aunque la cuenta ya este pagada
  y solo se reconoce como entrada cuando la mercancia fue recibida.
- Se aplico la migracion `20260914120000_conteo_diario_inventario` en la base
  local `POS`, previo respaldo valido en `server/backups/`. La estructura y sus
  restricciones fueron verificadas directamente en PostgreSQL; 19 suites/150
  pruebas, compilaciones y lint aprobaron.

### 2026-09-15 — Despliegue provisional en la nube

- Se creo una base PostgreSQL nueva en Neon. El primer despliegue de Render
  aplico las migraciones versionadas y el seed inicial se ejecuto correctamente.
- El backend se publico como `cuaresnor-pos-api` en
  `https://cuaresnor-pos-api.onrender.com`; su endpoint `/health` responde 200.
- El frontend se publico en
  `https://cuaresnor-pos-web.vercel.app` y su compilacion contiene la URL
  correcta del backend.
- Cloudinary quedo configurado como almacenamiento persistente de imagenes.
- `CORS_ORIGIN` autoriza exclusivamente el origen principal de Vercel. Una
  solicitud preflight real a `/auth/login` respondio 204 con ese origen.
- Los secretos `DATABASE_URL`, `CLOUDINARY_URL`, `JWT_SECRET` y
  `PRINT_AGENT_KEY` permanecen fuera del repositorio.

### 2026-09-16 — Separacion de impresoras de caja y preparacion

- Se agrego el destino `CAJA` para una impresora termica dedicada a facturas;
  `GENERAL` se conserva para la impresora compartida de cocina/barra.
- La emision de un ticket de factura usa exclusivamente una impresora `CAJA`
  activa. Si no existe, devuelve un motivo claro y no desvia el ticket a la
  impresora de preparacion. Las comandas no usan `CAJA` como respaldo.
- Los trabajos de factura pendientes creados con el enrutamiento anterior se
  marcan como fallidos durante la migracion para impedir que salgan por barra;
  se pueden reenviar desde Cuentas cobradas una vez configurada la caja.
- El modulo Impresoras permite registrar ambas colas USB y muestra si falta
  cobertura para caja, cocina o barra. Se actualizo la guia de instalacion y
  prueba fisica de las dos impresoras.
- Las migraciones `20260916120000_impresora_caja` y
  `20260916121000_cancelar_facturas_ruta_anterior` se aplicaron en la base
  local `POS` tras un respaldo en `server/backups/`. Prisma confirma que el
  esquema local esta al dia. La validacion suma 20 suites/154 pruebas,
  compilacion del servidor y compilacion/lint del cliente. Sigue pendiente la
  prueba fisica en el restaurante.
- Los planes gratuitos permiten la demostracion; para uso comercial, Vercel
  Hobby requiere cambio de plan o de alojamiento y Render Free debe evaluarse
  por su suspension tras inactividad. El sondeo del agente cada 3 segundos
  puede mantener Neon activa durante todo el turno, por lo que sus CU-horas
  tambien necesitan vigilancia temprana.

## Pendiente inmediato

- La configuracion de despliegue se reviso para la arquitectura Neon + Render
  + Vercel + Cloudinary. `render.yaml` ya declara la clave compartida del agente
  de impresion y usa instalaciones reproducibles desde el lockfile. La guia de
  despliegue distingue entre reutilizar el ambiente anterior y crear uno nuevo,
  e incluye migraciones, seed, CORS, impresion y verificaciones operativas.
- El nuevo servicio de Render se identifica como `cuaresnor-pos-api`, evitando
  modificar por nombre el servicio `pos-api` asociado al repositorio anterior.
- La generacion de `PRINT_AGENT_KEY` usa una API compatible con Windows
  PowerShell 5.1; se descarto la clave nula producida por el intento fallido.
- La base local ya está migrada. En futuros ambientes de despliegue todavía se
  debe ejecutar `prisma migrate deploy` y configurar las fichas iniciales del
  restaurante.
- Se agregó `GUIA_IMPRESION_COMANDAS.md` con la instalación completa del
  controlador Epson, la clave compartida, el agente automático de Windows,
  las pruebas de punta a punta y el diagnóstico de reintentos. La revisión del
  computador de caja confirmó que esos pasos físicos todavía están pendientes.
- Instalar la cola de Windows en el computador de caja, registrar los nombres
  exactos de las dos impresoras USB y configurar `PRINT_AGENT_KEY` tanto en el
  servidor como en el agente local.
- Realizar una prueba operativa de punta a punta con una impresora real:
  factura, comanda compartida cocina/barra, falta de papel y reintento.
- Definir si se activara una tercera impresora independiente para barra.

## Reestructuracion solicitada (decisiones en definicion)

### Pedidos, pago anticipado y fichas

- Todas las decisiones de esta seccion se implementaron el 2026-09-01. Las
  excepciones y reglas exactas se resumen arriba en “Reestructuracion
  operativa del restaurante”.

### Estados de inventario

- Implementado: umbrales bajo/alto opcionales y estados solo informativos.

### Impresion termica local

- Implementado; quedan las tareas de instalacion y prueba fisica descritas en
  “Pendiente inmediato”.

### Cuadre de caja

- Implementado el cuadre por turno con efectivo, transferencias y cuentas por
  pagar. Las cuentas cobradas ya pueden visualizarse separadas por turno; un
  consolidado contable multi-turno más amplio queda para una iteración futura.

## Pendientes heredados que siguen vigentes

- Autoservicio del empleado (`/payroll/me/*`).
- Devoluciones parciales de factura mediante nota credito.
- Auditoria formal de devoluciones (`DevolucionPago`).

## Decisiones descartadas

- Pantalla exclusiva de cocina. El rol `COCINERO`, descartado inicialmente,
  vuelve a incorporarse por la definición de accesos del 2026-09-29, con
  inventario, toma de pedidos y Mi nómina del restaurante.

### 2026-09-25 — Panaderia como segunda area del POS (implementacion local)

- Se incorporo `PANADERIA` como area separada. Las cajas y turnos conservan
  el area; los usuarios tienen una asignacion de area y los cajeros solo
  acceden a la suya. Los administradores pueden operar ambas vistas.
- La panaderia tiene catalogo y existencias propios: panes, externos e
  insumos no vendibles. Los insumos conservan unidades y fracciones; la
  venta directa no usa mesas y acepta pagos mixtos.
- Las hornadas, recepciones, ventas, mermas y traslados quedan registrados
  como movimientos de inventario. El conteo muestra saldo inicial del dia,
  entradas, ventas POS, existencia de sistema, conteo fisico y diferencia
  valorada. Las diferencias se muestran para revision, sin crear ventas.
- La caja de panaderia permite apertura, movimientos, cuadre e historial
  propios. El cierre de tarde-noche y turno unico exige el conteo completo;
  el cierre conserva una fotografia de sus diferencias.
- Hay traslados internos en ambos sentidos. Panaderia a restaurante crea
  una cuenta por pagar en restaurante. Restaurante a panaderia solo envia
  ingredientes con stock a insumos de la misma unidad; panaderia registra
  su deuda interna. Salida, recepcion, pago y confirmacion del ingreso son
  pasos separados, con cantidad y precio pactado por traslado.
- Los reintentos de venta y de creacion de traslados usan una clave unica
  de operacion para evitar duplicados tras una respuesta de red incierta.
- La migracion aditiva `20260924190000_panaderia_separada` se verifico
  aplicando toda la historia sobre una base PostgreSQL temporal local.
  Despues se respaldo `POS` en
  `server/backups/pos-before-bakery-1790352034821.dump` (formato custom,
  archivo comprobado con `pg_restore --list`) y `migrate deploy` aplico la
  migracion nueva en esa base sin reiniciar datos. El historial local conserva
  cuatro migraciones antiguas presentes en la tabla de Prisma pero ausentes
  en el repositorio; `migrate status` seguira advirtiendolo. No ejecutar
  `migrate reset` ni `migrate dev` sobre `POS` sin conciliar ese historial.
- Verificacion: esquema Prisma valido, compilacion de backend y frontend,
  lint del cliente, 23 suites/185 pruebas y revision visual desktop/movil
  con respuestas simuladas. Ademas, en una base PostgreSQL temporal se
  recorrio apertura, venta y reintento idempotente, traslados en ambos
  sentidos, recepcion, pago, conteo y cierre de caja. Falta la validacion
  operativa con los datos reales del negocio.
- **Pendiente fiscal:** confirmar NIT y numeracion de las dos areas. Por
  ahora las ventas de panaderia y los traslados generan comprobantes
  internos, no facturas fiscales ni tickets impresos de panaderia.
- **Pendiente despliegue:** aplicar migracion en Neon y publicar API/web solo
  despues de validar una copia de los datos y el flujo fiscal. Este cambio
  aun no se ha subido a produccion.

### 2026-09-25 — Inventario y reportes por area; recetas de panaderia

- Se unifico la navegacion de **Inventario**: el administrador elige primero
  Restaurante o Panaderia; los cajeros ven solamente su area. Conteo diario,
  ingredientes y recetas consultan y muestran los datos del area seleccionada.
  La produccion diaria existente sigue siendo exclusiva de restaurante.
- Los ingredientes de panaderia son insumos propios, independientes de los
  del restaurante. Cada pan puede tener una receta versionada que indica
  insumos y cantidades por unidad. Registrar una hornada exige receta activa
  y existencia suficiente; descuenta los insumos en la misma transaccion.
  El conteo separa ese consumo de ventas y mermas para no crear diferencias
  falsas.
- El panel de analisis permite elegir Restaurante o Panaderia. Las ventas,
  metodos, horarios, categorias y productos de panaderia proceden de sus
  ventas cobradas; no se mezclan con facturas de restaurante. Se ocultan
  fichas, domicilios, meseros y propinas cuando no aplican.
- La caja de panaderia ya no presenta el formulario de apertura cuando falla
  la consulta del turno o de las cajas. Ofrece reintento, y avisa si existe
  un turno abierto por otra sesion. La lectura del turno despues de abrir se
  comprobo en una base temporal; no se reprodujo un fallo del servicio de
  lectura con los datos locales disponibles.
- `20260925130000_recetas_panaderia` se aplico en la base temporal y en `POS`
  local, despues de crear y verificar el respaldo privado
  `server/backups/pos-before-bakery-recipes-1790354081794.dump`. No se
  modifico Neon ni se publico una nueva version.
- Verificacion: esquema Prisma, compilaciones, lint, pruebas automatizadas,
  flujo funcional PostgreSQL temporal (turno, receta, hornada, venta, conteo,
  reporte y cierre), y revision de inventario y reportes en escritorio/movil
  con API simulada. Pendiente probar el flujo con usuarios y saldos reales.

### 2026-09-29 — Accesos por rol/área y remisiones de panadería

- Roles definidos: administrador global, administrador local, cajero, mesero,
  cocinero y panadero. Cada perfil ve los módulos correspondientes y comienza
  en su pantalla de trabajo. El área activa y el rol tienen nombres legibles
  también en móvil. Solo el administrador global puede cambiar de área.
- Los permisos se comprueban en el servidor, no solo ocultando botones. Los
  administradores locales no pueden promover usuarios a globales ni acceder
  a empleados, usuarios, proveedores o cuentas de la otra área. Las sesiones
  existentes pierden permisos al cambiar el rol o desactivar al empleado.
- El administrador global conserva administración, inventario y supervisión
  de ambos negocios, pero tiene prohibido cobrar, facturar, operar turnos y
  registrar pagos. El antiguo rol `ADMIN` se migra a `ADMIN_GLOBAL`; para
  operar caja se necesita un cajero o `ADMIN_LOCAL` del área correspondiente.
  Se mantiene la protección del último administrador global activo.
- Panadería tiene catálogo propio de Panadería (panes), Pastelería (postres)
  y externos. El panadero recibe insumos y registra hornadas con descuento
  de receta; el cajero recibe productos externos y trabaja con caja,
  proveedores y remisiones. Ambos tienen acceso a Mi nómina. Restaurante
  conserva sus propios ingredientes, recetas, fichas, pedidos e impresoras.
- Caja de panadería utiliza el módulo compartido de turnos, movimientos,
  pagos, cuadre y cierres históricos, con sus datos y ventas de mostrador.
  Proveedores, cuentas y configuración de nómina quedan separados por área.
  Las cuentas recibidas de proveedores ingresan mercancía al confirmar
  recepción; no incrementan stock únicamente por crear la factura.
- Remisiones: cada entrega física registra producto, cantidad, precio,
  concepto, responsable y fecha. Sale del stock de panadería y entra al
  ingrediente del restaurante con la misma unidad, en una transacción.
  Se agrupa por turno o por día; no se mezclan modalidades en la misma fecha.
  La remisión diaria acumula los turnos y se cierra solo en turno único o
  tarde-noche. Cerrar congela las entregas y genera una cuenta por pagar del
  restaurante, que solo admite pago completo. Panadería confirma una única
  vez la recepción del dinero, distinguiendo efectivo de transferencia.
  El cierre de caja comprueba que no queden remisiones que deban cerrarse.
- Se conservan los traslados históricos y la recepción de ingredientes desde
  restaurante hacia panadería, manteniendo unidades y cantidades fraccionarias.
  No se recrean entradas de inventario por cerrar o pagar una remisión.
- Migración `20260928120000_accesos_areas_remisiones` aplicada a `POS` local
  con respaldo previo `server/backups/pos-before-bakery-recipes-1790659076084.dump`,
  comprobado con `pg_restore --list`. No se borraron ni reiniciaron datos.
  Continúa la advertencia sobre las cuatro migraciones antiguas ausentes del
  repositorio: no ejecutar `migrate reset` o `migrate dev` para ocultarla.
- Verificación: 24 suites / 208 pruebas unitarias, compilaciones del servidor
  y cliente, lint del cliente y esquema Prisma validado. 129 comprobaciones
  HTTP sobre PostgreSQL temporal recorren aislamiento, permisos, proveedores, hornadas,
  apertura/lectura de turno, remisiones por turno y por día, pago completo,
  ingreso idempotente, conciliación y cierre. Revisión de seis perfiles con
  API simulada en navegador y capturas de escritorio/móvil; el revisor final
  confirmó resueltas las tres correcciones de usabilidad solicitadas.
- Guía operativa: `docs/ROLES_Y_AREAS.md`. Pendiente validar los usuarios,
  catálogos, saldos y procedimientos con el negocio. NIT/numeración fiscal
  de panadería y prueba física de impresoras continúan pendientes.
- Cambios guardados en commits locales. Esta etapa no modifica Neon, Render
  ni Vercel; publicación en producción pendiente.

### 2026-09-29 — Supervisión global y valoración monetaria de conteos

- El administrador global deja de tener acceso a Usuarios, Catálogo, Nómina,
  Mi nómina e Impresoras. La restricción cubre menú, rutas directas y API en
  ambas áreas, incluido el rol heredado `ADMIN`. Conserva su perfil y cambio
  de contraseña, inventario, estadísticas, proveedores, cierres y remisiones.
  Los administradores locales y trabajadores conservan sus módulos propios.
- Inventario consulta una lista mínima de productos de su área, independiente
  del módulo de Catálogo, para que producción, recetas y lista fija de conteo
  sigan funcionando sin conceder acceso al catálogo al supervisor global.
- Cada conteo confirmado conserva una valoración monetaria: precio de venta
  para productos y costo unitario para ingredientes. Se distinguen ingreso
  estimado por ventas corroboradas, costo de consumo, pérdida por faltantes
  sin justificar y sobrante. El consumo no es dinero cobrado ni utilidad;
  los sobrantes no crean ingresos ni compensan las pérdidas de otros artículos.
- Traslados y mermas registrados se separan de ventas y consumo. Las entradas
  de proveedores cuentan al confirmar recepción, no al crear la factura.
  Ninguna valoración genera ventas, cobros o ajustes de stock automáticamente.
- Los insumos de panadería admiten un costo opcional por unidad y cantidades
  fraccionarias. Costo vacío significa sin referencia; cero explícito es válido.
  Al confirmar se guarda el nombre, unidad, referencia e importes del conteo:
  cambiar posteriormente precios o costos no recalcula su historial.
- El conteo muestra un resumen mensual por artículo y área, separado entre
  productos e ingredientes. No suma registros antiguos sin valoración,
  pendientes, no comparables, sin referencia ni aquellos por recontar; indica
  sus exclusiones. Reabrir elimina la valoración hasta confirmar nuevamente.
  Movimientos posteriores al conteo obligan a recontar antes de usar sus importes.
- Migración aditiva `20260929090000_valoracion_conteos` aplicada a `POS` local
  tras crear el respaldo privado
  `server/backups/pos-before-inventory-valuation-1790697050163.dump`
  (339411 bytes, formato custom comprobado con `pg_restore --list`). No se
  reconstruyeron importes antiguos ni se cambió la base de producción.
- Verificación: Prisma válido, compilaciones de servidor y cliente, lint del
  cliente, 25 suites / 329 pruebas unitarias y 228 comprobaciones HTTP sobre
  PostgreSQL temporal (187 permisos/remisiones y 41 valoración financiera).
  La provisión administrativa se probó también en bases temporales. Las tres
  bases temporales se eliminaron al terminar.
- Navegador: 31 controles con API simulada, sin errores React ni desbordamiento
  en escritorio/móvil. Incluye referencias congeladas, costos opcionales,
  separación de importes, permisos globales, recuperación de errores y estado
  mensual vacío. Se conserva la interfaz existente con importes diferenciados
  por color. La revisión independiente pidió ampliar el selector mensual para
  mostrar el año completo; su veredicto sobre esa corrección fue resuelto,
  con disposición de envío tras comprobar las seis capturas renovadas.
- Preparación de accesos: `server/scripts/provision-local-admin.cjs` permite
  simulación sin cambios y provisión explícita para empleados del área,
  preservando historial y protección del último administrador global.
  Las credenciales no se incluyen en código, documentación ni commits.
- Por autorización del usuario, se crearon dos administradores locales nuevos
  únicamente en `POS`: uno de Panadería y otro de Restaurante, con sus
  empleados activos mínimos y sin tarifas o jornadas ficticias. Se verificaron
  rol, área, bcrypt12 y autenticación real de ambos. El administrador global
  existente conserva su rol y contraseña. Las claves temporales se entregan en
  un archivo privado ignorado por Git y con acceso exclusivo para el usuario
  de Windows; no están en esta documentación ni en el historial de commits.
- Guías actualizadas: `docs/ROLES_Y_AREAS.md` y
  `docs/VALORACION_CONTEOS.md`. El contexto de producto refleja las nuevas
  restricciones y reglas monetarias; se preservó el sistema visual existente.
- No se publicaron cambios en Neon, Render ni Vercel. Continúan pendientes
  la validación operativa con el negocio, el NIT/numeración fiscal y la prueba
  física de las impresoras.

### 2026-09-29 — Apertura del conteo e informe por fechas

- Al añadir por primera vez un ingrediente del Restaurante a la lista fija,
  el saldo inicial se guarda a partir del inventario. Se reconstruye la
  apertura del día con los movimientos ya registrados para no duplicar
  entradas ni ignorar salidas anteriores al alta. El último conteo físico
  confirmado prevalece; retirar y reactivar el mismo día conserva la base.
- Los productos de carta del Restaurante no tienen existencias propias y
  conservan el saldo inicial manual, tal como se acordó. El formulario solo
  solicita ese dato para productos; para ingredientes indica la base automática.
- Panadería abre el primer conteo desde sus existencias y movimientos reales.
  Si hay un conteo anterior, el nuevo día parte de ese físico más los
  movimientos posteriores, sin duplicar `AJUSTE_CONTEO`. La proyección y el
  conteo guardado utilizan la misma apertura; volver a contar ese día no la
  recalcula. Una fecha histórica sin registros suficientes ya no muestra el
  stock actual como si fuera el saldo antiguo.
- El análisis monetario en Inventario permite cualquier rango inclusivo de
  fechas de Colombia de hasta 366 días; ofrece Hoy, Últimos 7 días y Este mes.
  Agrupa por artículo y área, separando ingreso estimado de productos a precio
  de venta, costo consumido de ingredientes y pérdidas estimadas por faltantes.
  Mantiene referencias históricas congeladas y excluye conteos pendientes,
  por recontar, no comparables, sin costo y anteriores a la valoración. La API
  mensual sigue disponible para compatibilidad.
- Las tarjetas diarias ahora priorizan cifras, diferencias y acciones; se
  quitaron las explicaciones repetidas y un rótulo poco visible. Los
  conceptos necesarios para interpretar el dinero quedan en el análisis y
  la guía. No se crearon ventas, cobros ni ajustes de existencias al calcular
  importes.
- Verificación: servidor y cliente compilan; lint del cliente aprobado;
  25 suites / 366 pruebas unitarias y 92 comprobaciones HTTP en PostgreSQL
  temporal local. Las bases temporales se eliminaron y se verificó que no
  quedara ninguna. La base `POS` real no se modificó; no hay migración nueva.
- Interfaz: 27 controles con API simulada, cinco capturas de escritorio/móvil
  y revisión final de las tres correcciones de presentación resuelta. Las
  capturas no sustituyen la prueba HTTP real; ambas verificaciones se hicieron
  por separado. Se conservó la identidad visual existente.
- Cambios en commits locales; sin despliegue en Neon, Render ni Vercel. La
  prueba física de las impresoras y las definiciones fiscales siguen
  pendientes.

### 2026-09-29 — Historial del conteo, vista futura y apertura de caja

- Restaurante ya no muestra la sección **Traslados**: se retiraron su ruta,
  entrada del menú, permiso de navegación y componente exclusivo. No se
  eliminaron registros históricos ni el flujo de remisiones de Panadería.
- **Conteo diario** separa internamente **Registro diario** y **Análisis por
  fechas** para ambas áreas. El informe ya no queda debajo de todas las
  tarjetas de la lista fija.
- Cambiar a una fecha pasada consulta únicamente los conteos guardados,
  en solo lectura. En Restaurante se corrigió la llamada del cliente que
  intentaba ejecutar `prepare` al consultar días anteriores. Panadería
  consulta por fecha e incluye conteos de artículos hoy desactivados sin
  presentar el stock actual como histórico.
- Una fecha futura presenta los elementos de la lista fija actual de
  Restaurante o los artículos activos de Panadería como vista previa. No
  permite ingresar, confirmar ni editar cantidades; el servidor de
  Restaurante también rechaza crear, cerrar, reabrir o borrar conteos de
  fechas distintas de hoy. No se generan registros futuros por navegar.
- Se verificó que el bloqueo de apertura de la única caja de Restaurante
  es real: el turno **#8** permanece abierto desde el 23 de septiembre,
  asociado al usuario `admin@pos.local`, que hoy es administrador global.
  No se cerró ni alteró. La pantalla ahora identifica el turno, responsable
  y apertura; un administrador local puede acceder a su cuadre y cierre
  ordinario con todas las validaciones, mientras el cajero recibe una
  instrucción para solicitar ese cierre.
- Por autorización del usuario, se creó un respaldo privado del POS local
  `server/backups/pos-before-inventory-valuation-1790734164303.dump`
  (340044 bytes) antes de cargar ejemplos. Se insertaron exclusivamente en
  `POS` local un producto de carta deshabilitado, un ingrediente sin stock y
  un artículo de Panadería inactivo, todos marcados `[PRUEBA]`, con conteos
  ilustrativos del **26 y 27 de septiembre de 2026**: Restaurante producto
  #21 e ingrediente #24; Panadería artículo #1. El informe de esas fechas
  fue verificado en ambas áreas: Restaurante muestra pérdidas ilustrativas
  de $10.500 en producto y $2.000 en ingrediente; Panadería, $31.500 de
  ingreso estimado y $10.500 de faltante. Estos importes son **datos de
  prueba, no operación real**; no se crearon pedidos, facturas, ventas,
  pagos, turnos ni movimientos de stock por la carga. Una lectura de los
  días 26 y 27 mostró ese historial en ambas áreas; consultar el 30 de
  septiembre no creó conteos futuros.
- Verificación técnica: 25 suites / 376 pruebas del servidor, compilaciones
  de servidor y cliente, y lint del cliente sin errores. La interfaz pasó
  23 comprobaciones con API simulada en escritorio y móvil, incluyendo
  fechas pasadas y futuras, navegación interna y caja ocupada. Se validó
  también el formato legible del respaldo privado con `pg_restore --list`.
- Sin migraciones nuevas ni cambios en Neon, Render o Vercel. El turno #8
  requiere un cuadre real antes de abrir otro en esa caja. Continúan
  pendientes la prueba física de las impresoras y la definición fiscal.

### 2026-09-30 — Inventario de Panadería, salidas justificadas y datos de prueba

- El conteo diario de Panadería usa una **lista fija** de artículos existentes
  (productos del catálogo e ingredientes); ya no se crean nombres libres desde
  el conteo. Añadir o retirar un artículo afecta el día actual y los futuros,
  sin borrar fotografías históricas. El primer conteo parte del stock actual
  si no existe uno anterior. El historial es de solo lectura y las fechas
  futuras muestran la lista sin admitir cantidades.
- Inventario de Panadería tiene una sección **Productos** separada en panes,
  postres y externos. Las hornadas se registran ahora desde la hoja de
  producción con receta activa y consumo de insumos; Productos conserva
  recepciones de productos externos y salidas manuales con motivo;
  muestra existencias e historial de movimientos. Estas salidas se separan de
  las ventas, mermas y faltantes en la conciliación del conteo.
- Inventario de Restaurante tiene **Salidas** con motivo para ingredientes con
  stock y productos de carta. Las primeras descuentan existencias; las
  segundas quedan como movimiento documental del conteo, sin inventar stock
  propio ni generar cobros. Ambas se reconocen como justificadas, no como
  ventas ni pérdidas. Se mantuvieron las restricciones de rol y área.
- El catálogo de Panadería permite crear, renombrar y desactivar categorías
  propias de panes, pastelería y externos, y asociarlas a los artículos. Las
  categorías de Restaurante siguen independientes.
- Se aplicó **solo en la base local `POS`** la migración
  `20260929130000_lista_conteo_y_categorias_panaderia`. Antes de cargar datos
  se verificó el respaldo privado
  `server/backups/pos-before-inventory-valuation-1790821925200.dump`
  (353069 bytes; archivo PostgreSQL legible con 816 entradas). No se modificó
  la base desplegada ni se ejecutó la migración en Neon.
- `server/scripts/seed-demo-local.cjs` carga ejemplos únicamente en
  `localhost/POS`, tras `--plan` y con `--apply`; `--verify` comprueba cifras.
  Es transaccional e idempotente mediante el marcador `[DEMO]`. Se cargaron 10
  artículos, recetas, hornadas, insumos, categorías, 3 ventas mixtas y 12
  conteos históricos de Panadería, además de catálogo, ingredientes, receta,
  salidas, proveedores, cuentas pendientes y meta de Restaurante. Son datos
  **ilustrativos**; se pueden consultar en la base local y no representan
  operación real. Los tres turnos demostrativos están cerrados; los turnos
  reales abiertos de Restaurante #8 y Panadería #11 quedaron intactos.
- La conciliación de la carga arrojó $316.500 en ventas y pagos de Panadería,
  $316.500 de ingreso estimado en sus conteos y $6.950 de pérdida estimada
  por faltantes. Repetir `--apply` no duplicó registros. Navegador local con
  ambos administradores: lista fija, grupos de productos, historial, bloqueo
  futuro y salidas verificadas sin errores de página; detector de interfaz sin
  hallazgos. Compilaciones, lint de cliente y pruebas unitarias completadas.
- Pendiente: aplicar la migración al entorno desplegado solo cuando se programe
  su publicación; las impresoras aún requieren prueba física en el computador
  de caja y la definición fiscal continúa abierta.

### 2026-09-30 — Plan y hoja de producción de Panadería

- La tabla de **Ingredientes** de Panadería ya no muestra “Ventas POS”; los
  insumos no se venden al público. En el análisis del conteo por rango, ambas
  áreas muestran al comienzo el ingreso estimado total de productos y la
  pérdida estimada total por faltantes. Los ingredientes siguen valorados a
  costo y no se presentan como ingreso por ventas.
- Inventario de Panadería incorpora **Producción diaria** para programar metas
  de panes y postres existentes con categoría activa. Administradores local y
  global crean, eliminan y reabren metas; el panadero las marca completas o
  no producidas. Resolver una meta no mueve inventario.
- El nuevo módulo **Producción** mantiene una hoja por panadero y día de
  Colombia. El panadero registra panes o postres ya creados, con receta activa;
  en una transacción se suma el producto, se consumen los insumos y se guarda
  cantidad, precio de catálogo de ese momento, subtotal y usuario. La clave
  idempotente evita hornadas duplicadas al reintentar. Al finalizar, la hoja
  queda bloqueada; administradores consultan avance en vivo e informes
  históricos con subtotales por panes/postres y valor total. La antigua ruta
  de entrada directa para panes/postres ahora rechaza el registro y remite a
  Producción; las recepciones de externos y salidas justificadas permanecen.
- Se ajustó la lectura de categorías para panadero y administrador global;
  crear o editar categorías continúa reservado al administrador local. El
  administrador global puede programar metas, pero no registrar ni finalizar
  hojas.
- Se creó un respaldo privado verificado del POS local antes de migrar:
  `server/backups/pos-before-inventory-valuation-1790826389459.dump`.
  Se aplicó **solo en `localhost/POS`** la migración
  `20260930120000_hojas_y_metas_produccion_panaderia`. No se modificaron Neon,
  Render ni Vercel.
- Prueba integrada local: con un artículo `[DEMO]` se programó una meta de 1
  unidad, el panadero registró una hornada y finalizó su hoja; se verificaron
  el incremento de producto, consumo exacto de insumos, reintento sin
  duplicación, permisos por rol, bloqueo posterior al cierre e informe de
  $3.500. Este registro es **dato de prueba en la base local**. Cliente y
  servidor compilan; 29 suites/413 pruebas del servidor y lint del cliente
  pasan. Se revisaron pantallas de administrador y panadero en escritorio y
  móvil, sin desbordamiento ni errores de JavaScript.
- Pendiente: publicar la migración y esta versión cuando se solicite un
  despliegue. La prueba física de impresoras y la definición fiscal siguen
  pendientes.

### 2026-09-30 — Categorías planas y eliminación en Panadería

- Las categorías de productos de Panadería ya no están subordinadas a Panes,
  Pastelería ni Externos. Se crean en una sola lista de primer nivel; el tipo
  operativo sigue perteneciendo al artículo y conserva las reglas de
  producción, inventario y recepción. Las categorías existentes mantienen sus
  identificadores y asociaciones.
- El administrador local puede eliminar definitivamente una categoría vacía.
  Si tiene artículos, incluso inactivos, debe reasignarlos primero desde
  Productos; así no se interrumpen recetas ni hojas de producción. Se corrigió
  el formulario de edición para que la reasignación realmente se guarde. El
  servidor responde con un conflicto claro ante una asignación o eliminación
  concurrente y mantiene la desactivación como opción separada.
- Se verificó el respaldo privado
  `server/backups/pos-before-flat-bakery-categories-1790829800415.dump`
  (373597 bytes; formato custom legible por `pg_restore`) y se aplicó la
  migración `20260930140000_categorias_panaderia_planas` **solo al POS local**.
  La migración conserva IDs/FK y resuelve nombres repetidos entre los antiguos
  grupos antes de imponer unicidad global; Neon, Render y Vercel no se tocaron.
- Prueba integrada en la app local: se creó una categoría temporal, se le
  reasignó un producto `[DEMO]`, se comprobó el bloqueo de eliminación mientras
  estaba en uso, se devolvió el producto a su categoría y se eliminó la
  categoría temporal. Los datos de prueba quedaron retirados. Vista de
  escritorio y móvil sin errores de página ni desbordamiento; compilan cliente
  y servidor, lint del cliente correcto y 29 suites/420 pruebas del servidor.
- Pendiente: desplegar esta migración y versión cuando se solicite; continúan
  pendientes la prueba física de impresoras y la definición fiscal.

### 2026-10-01 — Detalle de pagos desde el historial de cuadres

- Los pagos a empleados y proveedores en cada cuadre abren ahora su propio
  detalle de solo lectura. El enlace incluye turno, tipo e identificador del
  pago; al regresar a Caja se conserva el cuadre histórico consultado.
- El detalle muestra fecha, medio, concepto, importe y contexto del turno. En
  nómina también muestra observación y devengos cubiertos. Los pagos por
  traslado interno conservan su origen separado de una cuenta por pagar,
  incluso si sus números de registro coinciden.
- El administrador global puede consultar el comprobante del cuadre sin
  habilitarle acceso al módulo de Nómina ni operaciones de cobro. La
  autorización por área del turno sigue a cargo del servidor.
- Se verificaron compilaciones de cliente y servidor, lint del cliente y las
  420 pruebas del servidor. Una prueba de navegación con respuestas simuladas
  comprobó los tres tipos de pago, IDs coincidentes, regreso al turno y vista
  móvil sin desbordamiento. Este cambio no requiere migración de base de
  datos. Quedan pendientes el despliegue solicitado por separado, la prueba
  física de impresoras y la definición fiscal.
