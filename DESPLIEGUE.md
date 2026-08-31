# Guía de despliegue

Este proyecto se despliega en tres servicios gratuitos:

| Pieza | Servicio | Qué aloja |
| --- | --- | --- |
| Base de datos | **Neon** | PostgreSQL |
| Backend (`server/`) | **Render** | API NestJS |
| Frontend (`client/`) | **Vercel** | SPA de Vite/React |
| Imágenes de productos | **Cloudinary** | archivos subidos (el disco de Render es efímero) |

El repositorio ya viene preparado: `render.yaml` (blueprint del backend), `client/vercel.json`
(fallback SPA), endpoint de salud en `/health` y soporte de Cloudinary/CORS por variables de
entorno. Solo falta crear las cuentas y pegar los secretos.

---

## 1. Neon (base de datos)

1. Crear un proyecto en <https://neon.tech> (región **US East** para que quede cerca de Render/Colombia).
2. Copiar la **connection string**. Usar la conexión **directa** (la que **no** dice *pooled*),
   incluye `?sslmode=require`. Se ve así:
   ```
   postgresql://usuario:password@ep-xxxx.us-east-1.aws.neon.tech/neondb?sslmode=require
   ```
   Guardar ese valor: es el `DATABASE_URL`.

## 2. Cloudinary (imágenes)

1. Crear cuenta gratis en <https://cloudinary.com>.
2. En el **Dashboard**, copiar la variable **`CLOUDINARY_URL`** (Cloudinary la muestra ya armada,
   con formato `cloudinary://<api_key>:<api_secret>@<cloud_name>`). Ese es el valor de `CLOUDINARY_URL`.

## 3. Render (backend)

**Opción A — Blueprint (recomendada):**

1. En <https://render.com>: **New → Blueprint** y seleccionar el repo `POS-app`.
   Render lee `render.yaml` y propone el servicio `pos-api`.
2. Rellenar las variables marcadas como secretas:
   - `DATABASE_URL` → la de Neon (paso 1).
   - `CLOUDINARY_URL` → la de Cloudinary (paso 2).
   - `CORS_ORIGIN` → dejarla vacía por ahora (se rellena en el paso 5).
   - `JWT_SECRET` y `TZ` ya vienen resueltas por el blueprint (secreto autogenerado y `America/Bogota`).
3. **Create** y esperar el primer build. El build corre solo:
   `pnpm install → prisma generate → prisma migrate deploy → build`.

**Opción B — manual (sin blueprint):** New → Web Service, root directory `server`, y usar como
build command `pnpm install && npx prisma generate && npx prisma migrate deploy && pnpm build`,
start command `pnpm start:prod`, health check path `/health`, y las mismas variables de arriba
(agregando `JWT_SECRET` a mano y `TZ=America/Bogota`).

Al terminar, anotar la URL pública del backend, p. ej. `https://pos-api.onrender.com`.
Verificar que responde: abrir `https://pos-api.onrender.com/health` → debe devolver `{"status":"ok"}`.

## 4. Sembrar la base (una sola vez)

Las tablas ya las creó `migrate deploy` en el build. Falta el seed (roles, admin, configs, caja).
Se corre **una vez** desde tu máquina apuntando a Neon, en `server/`:

```powershell
# PowerShell
$env:DATABASE_URL="<connection-string-de-neon>"
npx prisma db seed
```

Crea el admin `admin@pos.local` / `Admin123!` (o los valores de `SEED_ADMIN_EMAIL` /
`SEED_ADMIN_PASSWORD` si los defines antes de correrlo). Cambiar esa contraseña tras el primer login.

## 5. Vercel (frontend)

1. En <https://vercel.com>: **Add New → Project** e importar el repo.
2. **Root Directory:** `client`. Vercel detecta Vite solo (build `pnpm build`, output `dist`).
3. Agregar la variable de entorno **`VITE_API_URL`** = la URL del backend de Render
   (paso 3, **sin** barra final), p. ej. `https://pos-api.onrender.com`.
4. **Deploy.** Anotar el dominio resultante, p. ej. `https://pos-app.vercel.app`.

## 6. Cerrar el círculo (CORS)

1. Volver a Render → servicio `pos-api` → **Environment**.
2. Poner `CORS_ORIGIN` = el dominio de Vercel del paso 5 (`https://pos-app.vercel.app`,
   sin barra final; separar por comas si hay varios).
3. Guardar (Render redesplega solo). Listo: el front ya puede hablar con el back.

---

## Verificación final

- `GET https://<backend>/health` → `{"status":"ok"}`.
- Entrar al dominio de Vercel, iniciar sesión con el admin del seed.
- Crear un producto con imagen → la URL guardada debe apuntar a `res.cloudinary.com`
  (confirma que las imágenes sobreviven a los redeploys).

## Notas del plan gratuito

- **Render free** duerme el servicio tras ~15 min de inactividad: la primera petición luego de
  dormir tarda ~50 s en responder (cold start). Es normal en el plan gratis.
- **Neon free** también suspende el cómputo por inactividad; la primera consulta lo reactiva.
- Al cambiar variables de entorno en Render o Vercel hay que redesplegar para que tomen efecto
  (Render lo hace solo; en Vercel, *Redeploy*).
