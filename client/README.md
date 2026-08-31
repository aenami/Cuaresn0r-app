# POS — Frontend

Frontend del sistema POS para restaurante. Consume la API del backend NestJS (`../server`).

## Stack

- **React 19 + Vite + TypeScript** — base de la aplicacion.
- **TanStack Router** — rutas por archivos en `src/routes/` (el plugin de Vite genera `src/routeTree.gen.ts`; ese archivo no se edita a mano, pero si se versiona para que `tsc` funcione en un clon fresco).
- **TanStack Query** — datos del servidor (cache, revalidacion, estados de carga).
- **Zustand** — estado de cliente (sesion en `src/stores/auth.store.ts`, persistida en localStorage).
- **Tailwind CSS v4 + shadcn/ui** — estilos y componentes (en `src/components/ui/`, se agregan con `pnpm dlx shadcn@latest add <componente>`).
- **React Hook Form + Zod** — formularios y validacion.

## Estructura

```
src/
  routes/          # Rutas (file-based). __root.tsx es el layout raiz.
  components/ui/   # Componentes shadcn/ui.
  lib/api.ts       # Cliente HTTP: agrega el Bearer token y normaliza errores de Nest (ApiError).
  lib/utils.ts     # cn() de shadcn.
  stores/          # Stores de Zustand.
```

## Correr

```bash
pnpm install
pnpm dev        # http://localhost:5173 (el backend debe estar en http://localhost:3000)
pnpm build      # typecheck (tsc -b) + build de produccion
pnpm lint       # oxlint
```

La URL del backend se configura en `.env` (ver `.env.example`, variable `VITE_API_URL`).
