# Respaldo externo diario y recuperación PostgreSQL

## Estado real

La herramienta está implementada y probada con la base POS **local**.
No hay un respaldo externo diario activo todavía: falta elegir origen y destino,
configurar credenciales y publicar/activar el workflow. No se conectó a Neon,
se compró almacenamiento ni se subieron datos durante estas pruebas.

El esquema propuesto es Neon → proceso independiente de Render → bucket privado
S3/Cloudflare R2. Si se respaldan local y producción, usar configuraciones,
etiquetas y prefijos separados. Una base contiene ambas áreas del negocio.

## Qué hace la herramienta

1. Lee `BACKUP_DATABASE_URL` explícita; no toma `server/.env` automáticamente.
2. Abre una transacción de solo lectura y exporta su snapshot. `pg_dump` usa
   el mismo snapshot que la comparación de datos, incluso si hay ventas nuevas.
3. Genera un dump completo en formato custom. Falla si `pg_dump` emite advertencias.
4. Cifra dump y manifiesto juntos con AES-256-GCM y una clave aleatoria independiente.
   El archivo `.posbackup` contiene autenticación y huella SHA-256 del dump.
5. Con `--upload-s3`, lo sube, descarga de nuevo y verifica sus bytes completos.
   Que la API diga «subido» o que coincida el tamaño no basta.
6. Con `--restore-test`, restaura en una base **nueva y temporal local**; compara
   cantidades y huellas del contenido de todas las tablas, columnas, índices,
   restricciones, enums, definiciones de secuencias, rutinas, triggers y vistas.
7. Retira exclusivamente esa base temporal, validando nombre y OID. No usa
   `DROP ... FORCE`, `--clean` ni restaura sobre la base original.
8. Solo si la descarga externa y la restauración terminan correctamente publica
   `<prefijo>/latest-success.json`. Este indicador privado contiene fecha, objeto,
   clave identificadora y SHA-256; no contiene contraseñas ni filas de clientes.

Se usa `pg_dump`, no `prisma db push`: así se conservan también índices SQL
adicionales y el historial de migraciones. Las huellas de filas sirven para
comparación; la integridad criptográfica del archivo la dan GCM y SHA-256.
El verificador normaliza únicamente una coerción equivalente de arrays literales
de PostgreSQL y posiciones lógicas de columnas: columnas eliminadas no deben
producir una falsa diferencia al restaurar.

La copia custom permite una restauración flexible y consistente sin detener
las operaciones normales. [Documentación de PostgreSQL](https://www.postgresql.org/docs/17/app-pgdump.html).

## Preparación de seguridad

- Bucket **privado**, sin dominio público ni acceso anónimo. Token limitado al
  bucket y operaciones de lectura/escritura; el proceso no necesita borrar objetos.
- Cuenta del origen con acceso de lectura a todas las tablas y secuencias a
  respaldar. Si hay restricciones, RLS o extensiones, verificar permisos primero.
- Usar conexión **directa** de Neon, no el host `-pooler`; exigir TLS.
  Se recomienda `sslmode=verify-full`. No guardar URLs en código ni enviarlas al chat.
- Generar la clave en un computador privado con el comando de abajo. Guardarla
  en un gestor de contraseñas externo al bucket y al repositorio, con una segunda
  copia protegida accesible por el responsable de recuperación.
- No reutilizar la contraseña PostgreSQL, JWT ni la clave del agente de impresión.
  Perder la clave de cifrado vuelve irrecuperables las copias.
- `BACKUP_KEY_ID` identifica la clave, no la contiene. Al rotarla usa otro ID y
  conserva las anteriores mientras existan copias cifradas con ellas.
- Proteger el archivo de configuración y su carpeta con permisos del sistema.
  En Windows, los modos POSIX de Node no sustituyen los permisos NTFS.
- Durante la operación existen dumps temporales en claro en la carpeta privada.
  Se retiran al terminar normalmente, incluso al fallar. Una interrupción forzada
  puede dejarlos: el responsable debe revisar solo `.backup-work-*`/`.restore-work-*`
  de esa carpeta, no borrar carpetas amplias ni archivos ajenos.
- Copias y configuración privada están ignoradas por Git. No usar artefactos
  públicos de GitHub, correo o Cloudinary como almacenamiento de los dumps.

## Ejecución manual en Windows

Requisitos: Node 24, pnpm y herramientas PostgreSQL. La restauración de prueba
requiere un servidor PostgreSQL local de la **misma versión mayor** que el origen
y una cuenta local con permiso para crear bases. No se usa Neon como destino de
prueba. `pg_dump` no puede ser más antiguo que el servidor de origen.

Desde `server/`:

```powershell
pnpm install --frozen-lockfile
pnpm test:backup
pnpm backup:postgres keygen
```

El último comando muestra una clave: cópiala directamente al gestor privado y
al archivo de configuración; no la pegues en logs, commits ni conversaciones.

Copia `scripts/backup/.env.example` a una ruta privada, por ejemplo
`C:/RESPALDOS_PRIVADOS/POS/.env.backup`, y reemplaza los ejemplos. No reutilices
las claves generadas para las pruebas locales como claves de producción.

```powershell
# Copia local cifrada y prueba de restauración; no cuenta como respaldo externo.
pnpm backup:postgres backup --env-file "C:/RESPALDOS_PRIVADOS/POS/.env.backup" --restore-test

# Copia externa, descarga de verificación y prueba de esa copia descargada.
pnpm backup:postgres backup --env-file "C:/RESPALDOS_PRIVADOS/POS/.env.backup" --upload-s3 --restore-test

# Prueba independiente de un archivo descargado del bucket.
pnpm backup:postgres restore-test --env-file "C:/RESPALDOS_PRIVADOS/POS/.env.backup" --file "C:/RESPALDOS_PRIVADOS/POS/copia-descargada.posbackup"
```

Sin `--upload-s3` el reporte muestra `externalVerified: false` deliberadamente.
Sin prueba de restauración no se actualiza el indicador de éxito completo.
El reporte JSON guarda evidencia junto al archivo cifrado; no guarda la clave.
Si la operación falla, no reemplaza el último éxito. Revisa el error y repite con
un nuevo respaldo; no consideres correcta una copia solo porque existe un archivo.

## Activación diaria en GitHub Actions (opción S3/R2)

Preparado en `.github/workflows/postgres-backup.yml`, **inactivo por defecto**.
Horario propuesto: 03:17 Colombia. El runner realiza además una restauración
aislada cada día: no necesita que el PC de caja esté encendido.

1. Elegir y crear el bucket privado. Para R2, configurar el endpoint S3 y un token
   limitado al bucket. Definir inicialmente 30 días de retención de los objetos
   `.posbackup`, sin eliminar copias aún necesarias para una incidencia.
   Las reglas se configuran en el proveedor, no mediante borrados del programa.
   [Ciclo de vida de objetos en R2](https://developers.cloudflare.com/r2/buckets/object-lifecycles/).
2. En el repositorio, `Settings → Secrets and variables → Actions`, configurar:

   | Secrets (valores privados) | Variables (configuración) |
   | --- | --- |
   | `BACKUP_DATABASE_URL` | `BACKUP_POSTGRES_MAJOR` (ej. `17`, según Neon) |
   | `BACKUP_ENCRYPTION_KEY` | `BACKUP_KEY_ID` (ej. `principal-2026`) |
   | `BACKUP_S3_ACCESS_KEY_ID` | `BACKUP_LABEL` (ej. `produccion`) |
   | `BACKUP_S3_SECRET_ACCESS_KEY` | `BACKUP_S3_BUCKET` |
   | | `BACKUP_S3_PREFIX` (ej. `pos/produccion`) |
   | | `BACKUP_S3_ENDPOINT` (R2) |
   | | `BACKUP_S3_REGION` (`auto` para R2; región real para AWS) |
   | | `POS_BACKUP_ENABLED` (`true` al completar configuración) |

3. Confirmar la versión mayor del servidor en Neon y la conexión directa. El
   contenedor de la prueba debe usar esa versión; no actualizar producción para
   acomodarla a las herramientas. Proteger la rama principal y restringir quién
   puede modificar workflows/secretos; no ejecutar código no revisado con ellos.
4. Publicar el workflow en la rama predeterminada. En `Actions → Respaldo externo
   PostgreSQL → Run workflow`, ejecutar una primera prueba manual desde esa rama.
5. Revisar que el job termine correctamente, exista el `.posbackup` privado y que
   `latest-success.json` tenga fecha reciente y `restoreVerified: true`.
6. Descargar ese archivo desde el bucket y ejecutar la prueba independiente en
   otro entorno local privado. Esto comprueba también que el responsable conserva
   la clave y puede recuperar sin depender del runner.
7. Solo entonces dar por activado el servicio. Habilitar notificaciones de fallos
   de Actions y asignar a una persona la revisión de antigüedad del último éxito.

GitHub puede retrasar o descartar ejecuciones programadas por carga y desactiva
el cron de repositorios públicos sin actividad durante 60 días. **No es una
garantía contractual de una copia cada 24 horas**. Un job que no arrancó no puede
notificar su propio fallo. [Limitaciones oficiales del cron](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

Revisar cada mañana el indicador externo: si su `createdAt` supera **30 horas**,
falta el objeto o el job falla, tratarlo como incidencia y realizar una copia
manual. Para operación crítica, contratar un programador/servicio de respaldos
siempre activo y un monitor independiente de antigüedad. Esos servicios y sus
alertas de inactividad todavía **no están contratados ni configurados**.

El respaldo despierta el cómputo de Neon y consume almacenamiento, descargas y
minutos de Actions. Revisar cuotas/costos del plan elegido. El verificador lee
todas las tablas y ordena sus huellas; al crecer mucho la base hay que revisar
memoria, tiempos y tamaño. Subidas simples se limitan aquí a 5 GB.

## Ensayo y recuperación de una caída de base

- Ensayo automático: restauración aislada en cada ejecución completa. Ensayo
  humano recomendado mensual: descargar una copia anterior y ejecutar la prueba
  independiente usando la clave archivada. Nunca probar sobre POS ni Neon vivo.
- La herramienta rechaza claves equivocadas, archivos alterados, destinos de
  prueba remotos y diferencias de esquema/contenido. Si falla, **no cambiar la
  clave ni descartar el respaldo** antes de investigar.
- Restaurar solo archivos de procedencia propia y confiable: un dump puede
  ejecutar SQL. [Advertencia y opciones de pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html).
- Para recuperación real, declarar la incidencia y detener el uso de la API/agent
  hasta decidir el punto de recuperación. Proteger el estado existente. La
  operación digital sin Internet requiere una solución adicional aún no elegida.
- Elegir una copia verificada y restaurarla primero en una **base nueva vacía**,
  con credenciales propias. Esta herramienta hace ensayos y retira esa base;
  no tiene un comando de reemplazo de producción. El cambio real de conexión se
  hace en una intervención explícita y revisada por el responsable técnico.
- Antes de cambiar la conexión, verificar versión del código/migraciones,
  roles/accesos, áreas, caja, cuentas, inventario, remisiones y datos posteriores
  al respaldo. No ejecutar seed ni `db push` para «arreglar» una restauración.
- Reconciliar ventas y entregas ocurridas después del snapshot contra los soportes
  físicos. Puede perderse hasta el intervalo desde el último respaldo correcto,
  incluso si la copia restaurada está íntegra. No repetir cobros.
- Revisar la cola de impresión **antes de reconectar el agente**: un trabajo
  pendiente en la copia pudo imprimirse después del respaldo. Reenviarlo sin
  comprobar puede duplicar comandas. Coordinar cualquier reimpresión con cocina.
- Conservar la base anterior y el incidente hasta validar el servicio restaurado.

## Alcance y evidencia de la prueba local

Prueba realizada el 10-10-2026 con PostgreSQL local: **76 tablas y 3.161 filas**,
597 columnas, 251 índices, 276 restricciones, 104 valores enum y 75 definiciones
de secuencias coincidentes. No había rutinas, triggers propios ni vistas.
Los temporales de restauración se retiraron; POS solo recibió lecturas.
Respaldo cifrado, configuración privada y evidencia JSON están en
`server/backups/contingencia-20261010/` (ignorado por Git). No es evidencia de una
subida externa ni del funcionamiento del cron en GitHub.

El dump incluye datos del POS, nómina y contraseñas de usuarios de aplicación
ya almacenadas como hashes. No incluye roles globales de PostgreSQL, sus claves,
owners/grants recreados para producción, variables de Render/Vercel, secretos del
agente ni archivos de imagen en Cloudinary: conservar configuración y recursos
externos por separado. Las URLs de imágenes sí viajan dentro de la base.
