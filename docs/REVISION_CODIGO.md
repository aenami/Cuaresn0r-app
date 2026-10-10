# Revisión de código — 10 de octubre de 2026

## Limpieza aplicada

- Retirado el módulo operativo `salon`: las mesas físicas fueron reemplazadas
  por fichas. La ruta del cliente `/mesas` sigue activa porque hoy representa
  **Pedidos**; su nombre heredado no significa que sea código sin uso.
  El seed ya no crea zonas y mesas de demostración sin uso; tampoco imprime
  contraseñas en la consola. Los registros existentes no se eliminan.
- Retiradas las pantallas, endpoints, servicios y DTO de traslados antiguos en
  ambas direcciones, con autorización del usuario. Las nuevas entregas usan
  remisiones; no se permite terminar traslados mediante la API antigua.
- Eliminada la caja independiente de Panadería y sus llamadas duplicadas: la
  operación vigente utiliza el módulo compartido de Caja, filtrado por área.
- Retirada la asistencia con marcaciones en vivo y sus operaciones independientes
  de cerrar, reabrir o deshacer una marcación. Se mantiene el registro de horarios
  completos, incluidos turnos partidos y su liquidación de nómina.
- Eliminados componentes UI sin consumidores y consultas, mutaciones, tipos y
  envoltorios que ya no tenían referencias. Los helpers usados solo en su archivo
  permanecen internos, sin exportaciones innecesarias.
- Eliminadas cuatro dependencias de desarrollo sin uso en el servidor:
  `@eslint/eslintrc`, `eslint-plugin-prettier`, `source-map-support` y `ts-loader`.
  No se quitaron las fuentes, estilos o dependencias usadas por Prisma generado.

Se eliminaron 19 archivos de código sin uso. Se pueden recuperar desde Git.

## Historial conservado deliberadamente

No se alteraron el esquema, las migraciones ni los registros de PostgreSQL.
Se conservan las tablas de mesas, traslados, pagos y marcaciones porque contienen
historial o son parte de la persistencia del flujo vigente. Las consultas de
traslados y pagos antiguos usadas por caja, cuentas por pagar y conciliación
de inventario no son código muerto: evitan cambiar los resultados históricos.

El alias de rol `ADMIN` sigue siendo necesario para instalaciones y sesiones
heredadas; los nuevos roles se asignan desde `ROLES_SISTEMA`. El diagrama
`database.dbml` quedó identificado como histórico, no como esquema actualizado.

## Calidad y prevención

- ESLint del servidor vuelve a funcionar: configuración de Prettier corregida,
  cliente generado excluido y revisión sin escrituras ni advertencias.
- TypeScript del servidor ahora exige `noUnusedLocals` y `noUnusedParameters`.
- Las pruebas usan matchers tipados y argumentos de mocks definidos; la regla de
  métodos sin contexto usa la variante de Jest únicamente en pruebas, sin
  desactivar las reglas de seguridad de tipos del código de aplicación.
- Corregidos imports y variables innecesarios, una validación numérica fuera de
  la precisión segura de JavaScript, el tipo del mapa de salidas, el rechazo de
  errores de Cloudinary y la gestión de errores al arrancar el servidor.
- Agregado `pnpm check:unused` en cliente y servidor, con entradas reales de
  aplicación, pruebas y mantenimiento. Configuración basada en la
  [documentación de Knip](https://knip.dev/reference/configuration).
- Conservados TanStack Query, sus cachés y la carga por rutas. La revisión React
  no cambió librerías, diseño ni reglas del negocio.
- Sustituido el README genérico de Nest por instrucciones de este POS y corregida
  la guía de roles/remisiones que aún describía pantallas retiradas.

## Verificación

Ejecutar desde cada subdirectorio:

```text
client: pnpm build
client: pnpm lint
client: pnpm check:unused
server: pnpm build
server: pnpm exec tsc --noEmit
server: pnpm lint
server: pnpm check:unused
server: pnpm test --runInBand
server: pnpm test:e2e --runInBand
```

La suite e2e comprueba `/health`, diez rutas retiradas que deben responder 404
y la autenticación de remisiones y horarios completos, sin conectar la base.
La integración adicional local verifica 20 casos de stock compartido, entregas,
remisiones, recetas y cuadres en una transacción que se revierte al terminar.
Resultado: 34 suites/475 pruebas unitarias y 12 e2e correctas; compilaciones,
tipos, lint y detección de código sin uso correctos en ambas aplicaciones.
El agente local pasa la comprobación de sintaxis; eso no sustituye la prueba
física pendiente de las impresoras USB del restaurante.

## Límites de esta revisión

El grafo de código no estuvo disponible (`Transport closed`); se usaron búsquedas
acotadas, referencias estáticas, compilaciones y pruebas como alternativa.
Que las comprobaciones pasen no demuestra ausencia absoluta de errores.
Persisten servicios grandes (Caja, Panadería y conciliación) que conviene
separar por responsabilidad en cambios posteriores con pruebas de regresión.
No se hizo una auditoría de penetración ni se desplegó esta limpieza.
