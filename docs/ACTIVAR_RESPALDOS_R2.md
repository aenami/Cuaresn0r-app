# Activar los respaldos diarios en Cloudflare R2

## Estado y objetivo

El código está preparado; **el servicio todavía no está activo**. Esta guía no
crea cuentas, contrata almacenamiento, publica commits ni configura secretos.

Origen propuesto: la base de producción del POS en Neon. Destino elegido: un
bucket privado de R2. GitHub Actions genera una copia cifrada cada día a las
03:17 de Colombia, descarga el objeto y ensaya su restauración en PostgreSQL
temporal. No necesita que Render ni el computador de caja estén encendidos.
Si Actions falla o no se ejecuta, no existe una garantía de respaldo diario.

## 1. Crear el bucket privado

En tu cuenta de Cloudflare, habilita R2 revisando las condiciones y la facturación
que muestre el panel. Crea un bucket, por ejemplo `cuaresnor-pos-backups`, en
almacenamiento **Standard**. Ese nombre es un ejemplo; conserva el que elijas.

No actives acceso público por `r2.dev` ni un dominio público. Las copias contienen
información sensible aunque estén cifradas. No necesitas CORS para el navegador:
el proceso de respaldo se comunica directamente con R2, no desde la página POS.
[Creación y privacidad de buckets](https://developers.cloudflare.com/r2/buckets/create-buckets/).

## 2. Crear credenciales exclusivas para respaldos

En R2 → Account Details → API Tokens → Manage, crea un token con **Object Read &
Write**, limitado solo al bucket de respaldos. No uses Admin Read & Write: el
programa no necesita crear/borrar buckets ni modificar sus reglas.

Guarda en un gestor privado el **Access Key ID**, **Secret Access Key** y endpoint
S3 que proporciona R2. No son el JWT del POS ni un token público del frontend.
El secreto se muestra al crearlo; no se puede consultar de nuevo después.
El endpoint habitual es `https://ID_CUENTA.r2.cloudflarestorage.com`; copia el
correcto del panel, especialmente si elegiste una jurisdicción específica.
[Autenticación oficial de R2](https://developers.cloudflare.com/r2/api/tokens/).

Para consultar/descargar durante una recuperación puede usarse otro token
**Object Read only** del mismo bucket. El programa no ejecuta borrados remotos.
No guardar credenciales ni archivos descargados en carpetas compartidas públicas.

## 3. Preparar Neon y la clave de cifrado

En Neon, identifica la base **de producción**, su versión mayor de PostgreSQL y
su conexión **directa**, no el host que termina en `-pooler`. Usa TLS; preferir
`sslmode=verify-full`. Una cuenta de respaldo necesita lectura de todas las tablas
y secuencias incluidas; revisar RLS/permisos si los hay. No cambiar la contraseña
del usuario de aplicación para preparar el respaldo.

Desde `server/`, genera una clave independiente en un terminal privado:

```powershell
pnpm backup:postgres keygen
```

Guárdala en el gestor de contraseñas y mantén una segunda copia protegida a la
que pueda acceder el responsable de recuperación. Asigna un ID, por ejemplo
`principal-2026`. Perder la clave hace irrecuperables las copias. Rotarla no
permite abrir respaldos antiguos con la nueva: conservar los IDs y claves previos.

No enviar URLs, contraseñas, claves o capturas del secreto por chat. No ponerlos
en commits, variables `VITE_*`, Vercel ni archivos públicos. Si se exponen, revocar
credenciales y evaluar qué copias pudieron verse afectadas.

## 4. Configurar GitHub Actions

Repositorio: `aenami/Cuaresn0r-app`. En **Settings → Secrets and variables →
Actions**, crea estos **repository secrets**:

| Secret | Contenido privado |
| --- | --- |
| `BACKUP_DATABASE_URL` | Conexión directa de la base de producción de Neon, con TLS |
| `BACKUP_ENCRYPTION_KEY` | Clave Base64 de 32 bytes generada en el paso anterior |
| `BACKUP_S3_ACCESS_KEY_ID` | Access Key ID de R2 |
| `BACKUP_S3_SECRET_ACCESS_KEY` | Secret Access Key de R2 |

Y estas **repository variables**, sin secretos:

| Variable | Valor |
| --- | --- |
| `BACKUP_POSTGRES_MAJOR` | Versión mayor real de Neon; no asumir `17` sin comprobar |
| `BACKUP_KEY_ID` | ID de la clave, por ejemplo `principal-2026` |
| `BACKUP_LABEL` | `produccion` |
| `BACKUP_S3_BUCKET` | Nombre exacto del bucket |
| `BACKUP_S3_PREFIX` | `pos/produccion` |
| `BACKUP_S3_ENDPOINT` | Endpoint S3 correcto del panel de R2 |
| `BACKUP_S3_REGION` | `auto` |
| `POS_BACKUP_ENABLED` | Inicialmente `false`; luego `true` para la primera ejecución |

No configurar `RESTORE_ADMIN_URL` en el workflow: el respaldo diario hace un
ensayo local, **no una recuperación real en Neon**. La configuración de su
PostgreSQL temporal ya está incluida y no tiene acceso a producción como destino.

El workflow debe estar publicado en la rama predeterminada (`main`). Crear un
commit local no lo publica. Las modificaciones a workflows pueden acceder a
secretos: restringe quién puede modificarlos y revisa esos cambios.

## 5. Ejecutar y comprobar la primera copia

Una vez publicados los cambios y completada la configuración:

1. Cambia `POS_BACKUP_ENABLED` a `true`.
2. Abre **Actions → Respaldo externo PostgreSQL → Run workflow**, desde `main`.
3. Confirma que el job termina correctamente. Un job **skipped** no hizo respaldo.
4. En R2, verifica que existan `pos/produccion/FECHA/ARCHIVO.posbackup` y
   `pos/produccion/latest-success.json`.
5. El indicador debe tener fecha reciente, `externalVerified: true` y
   `restoreVerified: true`. Se publica solo tras descargar la copia y restaurarla.
6. Haz la prueba independiente del paso siguiente antes de considerar listo el
   servicio. No basta con ver que existe un archivo ni que el upload terminó.

No ejecutar seed ni `prisma db push` como parte de un respaldo o restauración.
El workflow no cambia inventarios, ventas ni usuarios del origen.

## 6. Verificar que puedes recuperar fuera de GitHub

Instala Node/pnpm y herramientas PostgreSQL en un computador privado. Para el
ensayo local también necesitas un servidor PostgreSQL de la misma versión mayor
que Neon y permiso local para crear bases. Usa una carpeta privada protegida con
permisos NTFS en Windows; estar ignorada por Git no limita el acceso de otros usuarios.

Copia `server/scripts/backup/.env.example` a esa carpeta como `.env.backup`, con
la clave/ID guardados, R2, `BACKUP_DIR`, `PG_BIN_DIR` y `RESTORE_TEST_ADMIN_URL`.
La consulta no necesita clave de cifrado; descarga y restauración sí.

```powershell
# Desde server/. Comprobar el indicador y que el objeto exista (sin descargarlo entero).
pnpm backup:postgres status --env-file "C:/RESPALDOS_PRIVADOS/POS/.env.backup"

# Descargar y verificar SHA-256 + cifrado. No sobrescribe un archivo existente.
pnpm backup:postgres download --env-file "C:/RESPALDOS_PRIVADOS/POS/.env.backup"

# Usar la ruta exacta del archivo que devolvió download.
pnpm backup:postgres restore-test --env-file "C:/RESPALDOS_PRIVADOS/POS/.env.backup" --file "C:/RESPALDOS_PRIVADOS/POS/NOMBRE_REAL.posbackup"
```

Para una copia anterior, `download --key "pos/produccion/FECHA/NOMBRE_REAL.posbackup"`.
Si cambió la clave, utiliza una configuración privada con la clave/ID que
corresponde a ese archivo. Descifrar correctamente no significa que el respaldo
sea reciente: revisar siempre la fecha y el punto de recuperación.

## 7. Retención y revisión periódica

Después de verificar la primera recuperación, definir inicialmente 30 días de
retención para copias diarias en R2. Sus reglas de ciclo de vida eliminan objetos
automáticamente; revisar alcance antes de guardarlas. Para el prefijo propuesto,
una regla sobre `pos/produccion/20` alcanza las carpetas de fechas de este siglo,
sin incluir `pos/produccion/latest-success.json`. Adaptar si cambias el prefijo.
Conservar fuera de ese alcance las copias necesarias para una incidencia.
[Configuración oficial de retención](https://developers.cloudflare.com/r2/buckets/object-lifecycles/).

Asignar un responsable para revisar cada mañana `status`: devuelve error si
falta el objeto, no coincide con el indicador o han pasado más de 30 horas desde
el snapshot. En un fallo, investigar y realizar una copia completa verificada.
Habilitar las notificaciones de fallos de Actions. **Todavía no hay un monitor
independiente activo** que alerte cuando el scheduler nunca inicia el job.

Mensualmente, descargar una copia anterior y ensayar restauración. R2 protege
la copia contra una caída de Neon, pero no reemplaza la custodia de claves ni la
verificación. Revisar cuotas de Neon, R2 y GitHub Actions conforme crezca la base.

## Recuperación real

El procedimiento y comando `restore-new` están en
[Respaldo y recuperación PostgreSQL](RESPALDOS_POSTGRESQL.md#comando-de-recuperaci%C3%B3n-real-solo-durante-una-incidencia-o-ensayo-autorizado).
Crean y conservan una base nueva, sin sobrescribir la anterior ni cambiar Render.
Para ponerla en servicio se revisan datos posteriores al respaldo, permisos,
migraciones y cola de impresión, y luego se cambia la conexión explícitamente.

## Listo únicamente cuando...

- Bucket privado y credenciales restringidas configurados.
- Clave original e ID guardados por separado y recuperables.
- Workflow publicado y primera ejecución completa correcta, no omitida.
- Descarga externa y restauración independiente correctas.
- Segunda ejecución diaria comprobada y responsable de revisión asignado.

Las pruebas locales y el transporte S3 simulado del repositorio no sustituyen
esa evidencia externa. No se ha activado nada de esa lista desde este documento.
