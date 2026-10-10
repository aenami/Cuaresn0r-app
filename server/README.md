# POS — API

API de Panadería y Restaurante: NestJS, Prisma y PostgreSQL. Cada área conserva
sus catálogos, inventarios y caja; las remisiones registran entregas entre áreas.

## Preparación

Desde `server/`, instala con `pnpm install --frozen-lockfile`, configura las
variables de `.env.example` en un `.env` privado y ejecuta:

```bash
pnpm exec prisma generate
pnpm exec prisma migrate deploy
pnpm start:dev
```

Las migraciones modifican la base configurada en `DATABASE_URL`: verifica el
destino y respalda los datos antes de aplicarlas. El seed es un paso explícito
para instalaciones de prueba, no debe ejecutarse automáticamente en producción.

## Verificación

```bash
pnpm build
pnpm exec tsc --noEmit
pnpm lint
pnpm check:unused
pnpm test:backup
pnpm test --runInBand
pnpm test:e2e --runInBand
```

`lint` no modifica archivos; `lint:fix` aplica correcciones. `check:unused`
revisa referencias y dependencias considerando las entradas de Nest, Prisma,
pruebas y scripts de mantenimiento. Los e2e verifican el enrutado con la
persistencia simulada, sin escribir en la base POS.

`GET /health` es público y comprueba que el servidor responde, no la conexión
a PostgreSQL. Las operaciones de negocio requieren sesión y verifican rol y área.
Para producción: `pnpm build` y `pnpm start:prod`.

Consulta `../PROGRESO.md`, `../docs/ROLES_Y_AREAS.md` y
`../docs/REVISION_CODIGO.md`. El esquema vigente está en `prisma/schema.prisma`
y los índices SQL adicionales en `prisma/migrations/`. Las mesas y los traslados
antiguos se conservan únicamente como datos históricos; no tienen flujo operativo.

## Contingencia y respaldos

Procedimiento manual y formatos imprimibles: `../docs/CONTINGENCIA_SIN_INTERNET.md`.
Respaldo cifrado y restauración aislada: `../docs/RESPALDOS_POSTGRESQL.md`.
`pnpm backup:postgres --help` muestra los comandos; usa una configuración privada
explícita, no las variables del frontend. La automatización externa requiere
configuración adicional y permanece desactivada hasta validarla.
