# Guia de despliegue

La arquitectura de despliegue del proyecto es:

| Pieza | Servicio | Que aloja |
| --- | --- | --- |
| Base de datos | **Neon** | PostgreSQL |
| Backend (`server/`) | **Render** | API NestJS y cola persistente de impresion |
| Frontend (`client/`) | **Vercel** | SPA de Vite/React |
| Imagenes de productos | **Cloudinary** | archivos subidos; el disco de Render es efimero |
| Impresion USB | **Agente local de Windows** | consume la cola del backend y escribe ESC/POS en las impresoras |

El repositorio incluye `render.yaml`, `client/vercel.json`, el endpoint `/health`
y soporte de Cloudinary y CORS por variables de entorno. El agente de impresion
no se despliega: se instala unicamente en el computador de caja.

> Estos planes gratuitos sirven para demostraciones y pruebas. Vercel Hobby
> restringe su uso a proyectos personales/no comerciales; si el restaurante
> empieza a operar con el POS, hay que cambiar a Vercel Pro o trasladar el
> frontend a un alojamiento que permita uso comercial. Render Free tampoco se
> recomienda para operacion diaria: puede tardar cerca de un minuto en
> despertar despues de 15 minutos sin trafico. Cloudinary puede mantenerse
> gratuito mientras sus cuotas sean suficientes. Vigilar Neon especialmente:
> el agente consulta la cola de impresion cada 3 segundos y, mientras el PC
> este encendido, puede mantener activa la base incluso sin nuevas ventas.

## 0. Decidir si se reutiliza el despliegue anterior

Antes de crear recursos duplicados, entrar a Neon, Cloudinary, Render y Vercel
con la cuenta usada en la version anterior.

- Si los cuatro recursos todavia existen, reutilizarlos. Antes de migrar una
  base Neon con datos importantes, crear una rama de respaldo en Neon o hacer
  un `pg_dump` usando la conexion directa.
- Si no interesa conservar los datos anteriores, crear un proyecto Neon nuevo
  y seguir esta guia como un despliegue limpio.

Subir primero la version actual a GitHub. Vercel y Render solo ven los commits
que esten en el remoto:

```powershell
git status
git push origin main
```

`git status` debe indicar que el arbol esta limpio y el `push` debe terminar sin
errores.

## 1. Neon (base de datos)

1. Crear un proyecto en <https://neon.tech> o abrir el proyecto anterior. Usar
   **AWS US East (N. Virginia)** para mantenerlo cerca de Render.
2. Abrir **Connect** y copiar la connection string **directa**, la que no
   contiene `-pooler`. Debe incluir cifrado, normalmente
   `sslmode=require`, por ejemplo:

   ```text
   postgresql://usuario:password@ep-xxxx.us-east-1.aws.neon.tech/neondb?sslmode=require
   ```

3. Guardar ese valor: sera `DATABASE_URL`. La conexion directa es la indicada
   para migraciones y `pg_dump`. No exponerla en el frontend ni guardarla en
   Git.

## 2. Cloudinary (imagenes)

1. Crear una cuenta en <https://cloudinary.com> o abrir el entorno anterior.
2. En **Settings -> API Keys**, copiar `CLOUDINARY_URL`. Tiene formato:

   ```text
   cloudinary://<api_key>:<api_secret>@<cloud_name>
   ```

3. Tratarla como un secreto: contiene el API secret y solo debe configurarse en
   Render.

## 3. Render (backend)

### Opcion A: Blueprint (recomendada)

1. En <https://render.com>, elegir **New -> Blueprint** y conectar el repositorio
   `Cuaresn0r-app`, rama `main`. Render leera `render.yaml` y propondra el
   servicio `cuaresnor-pos-api` con raiz `server/`. El nombre es distinto al
   `pos-api` del proyecto anterior para que Render no intente modificarlo.
2. Completar las variables secretas:
   - `DATABASE_URL`: la conexion directa de Neon.
   - `CLOUDINARY_URL`: la variable completa de Cloudinary.
   - `PRINT_AGENT_KEY`: una clave aleatoria que tambien se configurara en el
     computador de caja. Se puede generar en PowerShell con:

     ```powershell
     $bytesClave = New-Object byte[] 32
     $generadorClave = [System.Security.Cryptography.RandomNumberGenerator]::Create()
     $generadorClave.GetBytes($bytesClave)
     $claveAgente = ([BitConverter]::ToString($bytesClave)).Replace('-', '').ToLowerInvariant()
     $generadorClave.Dispose()
     $claveAgente
     ```

   - `CORS_ORIGIN`: dejarla vacia inicialmente; se completa al obtener el
     dominio de Vercel.
   - `JWT_SECRET` y `TZ` los resuelve el Blueprint con un secreto generado y
     `America/Bogota`, respectivamente.
3. Crear el Blueprint y esperar el primer deploy. El build ejecuta
   `prisma migrate deploy`, por lo que aplica automaticamente todas las
   migraciones versionadas, incluido el conteo diario de inventario.
4. Copiar la URL publica, por ejemplo `https://cuaresnor-pos-api.onrender.com`, y abrir:

   ```text
   https://cuaresnor-pos-api.onrender.com/health
   ```

   La respuesta esperada es `{"status":"ok"}`.

### Opcion B: servicio manual

Crear un **Web Service** con estos valores:

| Campo | Valor |
| --- | --- |
| Repository | `Cuaresn0r-app` |
| Branch | `main` |
| Root Directory | `server` |
| Runtime | Node |
| Build Command | `pnpm install --frozen-lockfile && pnpm exec prisma generate && pnpm exec prisma migrate deploy && pnpm build` |
| Start Command | `pnpm start:prod` |
| Health Check Path | `/health` |

Agregar manualmente `DATABASE_URL`, `JWT_SECRET`, `CLOUDINARY_URL`,
`PRINT_AGENT_KEY`, `CORS_ORIGIN` y `TZ=America/Bogota`.

## 4. Sembrar una base nueva (una sola vez)

Omitir esta seccion si se reutilizo una base que ya tiene usuarios. En una base
nueva, las tablas las crea `migrate deploy`, pero falta el seed de roles,
administrador, configuraciones y caja. Ejecutarlo una vez desde `server/` con
credenciales iniciales propias:

```powershell
cd C:\Users\ASUS\Desktop\Proyectos\Cuaresn0r-app\server
$env:DATABASE_URL="<connection-string-directa-de-neon>"
$env:SEED_ADMIN_EMAIL="tu-correo@restaurante.com"
$env:SEED_ADMIN_PASSWORD="una-clave-inicial-segura"
pnpm exec prisma db seed
```

Cerrar esa terminal despues del seed para retirar los secretos de la sesion. El
seed es idempotente para el correo configurado, pero no debe usarse como metodo
habitual para crear administradores.

## 5. Vercel (frontend)

1. En <https://vercel.com>, elegir **Add New -> Project** e importar el mismo
   repositorio.
2. Configurar **Root Directory** como `client`. Vercel detectara Vite, usara
   `pnpm build` y publicara `dist`.
3. Agregar `VITE_API_URL` con la URL de Render, sin barra final, por ejemplo
   `https://cuaresnor-pos-api.onrender.com`. Marcarla para **Production** y, si se probaran
   despliegues de ramas, tambien para **Preview**.
4. Desplegar y copiar el dominio principal, por ejemplo
   `https://pos-app.vercel.app`.

`client/vercel.json` ya contiene el rewrite necesario para que las rutas
internas de la SPA funcionen al recargar.

## 6. Cerrar el circulo de CORS

1. Volver a Render -> `cuaresnor-pos-api` -> **Environment**.
2. Establecer `CORS_ORIGIN` con el origen exacto de Vercel, sin barra final, por
   ejemplo `https://pos-app.vercel.app`.
3. Si existen varios dominios permitidos, separarlos por comas. No usar `*` en
   produccion.
4. Guardar y esperar el redeploy de Render.

## 7. Conectar el agente local de impresion

En el computador de caja seguir `GUIA_IMPRESION_COMANDAS.md`, teniendo en cuenta:

- `POS_BACKEND_URL` debe ser la URL publica de Render, sin barra final.
- `PRINT_AGENT_KEY` debe coincidir exactamente con la configurada en Render.
- El puerto `3001` permanece local; no se publica en Render ni en Vercel.
- Al encender el computador, el agente consulta la cola persistente alojada en
  Neon. Si Render o la impresora no estan disponibles, los trabajos quedan para
  reintento.

## Verificacion final

- `GET https://<backend>/health` devuelve `{"status":"ok"}`.
- El dominio de Vercel permite iniciar sesion.
- Crear un producto con imagen genera una URL de `res.cloudinary.com` y la
  imagen sigue disponible despues de un redeploy.
- En **Inventario -> Conteo diario**, crear y finalizar un conteo de prueba.
- En **Caja**, abrir un turno de prueba y verificar que los datos persisten al
  recargar la pagina.
- Con el agente local abierto, usar **Ajustes -> Impresoras -> Probar** y luego
  enviar una comanda real de prueba. Registrar dos colas: `GENERAL` para
  cocina/barra y `CAJA` para facturas; probar ambas por separado.

## Diagnostico rapido

| Sintoma | Revisar |
| --- | --- |
| `P1000` de Prisma | usuario, contrasena y URL directa de Neon en `DATABASE_URL` |
| `P2022` o columna inexistente | logs del build; `prisma migrate deploy` debe haber terminado correctamente |
| Error de CORS en el navegador | `CORS_ORIGIN` debe coincidir exactamente con el origen de Vercel |
| Imagenes desaparecen | `CLOUDINARY_URL` ausente o invalida en Render |
| Agente recibe `401` o `403` | `PRINT_AGENT_KEY` distinta entre Render y Windows |
| Frontend llama a localhost | corregir `VITE_API_URL` y crear un deployment nuevo en Vercel |

## Notas de los planes gratuitos

- Render Free duerme el servicio tras 15 minutos sin trafico y puede tardar
  cerca de un minuto en volver. El sondeo del agente de impresion cuenta como
  trafico mientras el computador de caja esta encendido.
- Neon Free tambien puede suspender el computo por inactividad; la primera
  consulta lo reactiva.
- Los cambios de variables en Vercel solo aplican a deployments nuevos. Render
  normalmente redespliega al guardar variables.
- El filesystem de Render es efimero; por eso los archivos persistentes deben
  vivir en Cloudinary y los datos en Neon.
- Antes de operar comercialmente, revisar las condiciones de Vercel Hobby y
  aumentar Render a un plan que no duerma el backend. Supervisar en los paneles
  el almacenamiento y las CU-horas de Neon (sobre todo con el agente encendido)
  y los creditos de Cloudinary. Mantener respaldos externos de la base.
