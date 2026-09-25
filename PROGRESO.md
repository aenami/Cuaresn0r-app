# Progreso del proyecto

Este archivo registra el estado funcional y las decisiones tomadas al adaptar el
template POS al restaurante objetivo. Debe actualizarse junto con cada cambio de
alcance o feature terminada.

## Contexto actual

- El repositorio parte de un template POS para restaurante.
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

- Rol y pantalla exclusiva de cocina (`COCINERO`).

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
