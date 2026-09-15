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

## Pendiente inmediato

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
