import { join } from 'node:path';

// Carpeta raiz de archivos subidos por el usuario. Se sirve de forma estatica
// bajo /uploads (ver main.ts). Se ancla a process.cwd() = carpeta server/
// (todos los comandos se ejecutan desde ahi) para que la ruta
// sea identica en dev (`nest start`) y prod (`node dist/main`), y para que
// sobreviva al `deleteOutDir` de nest-cli (uploads/ vive fuera de dist/).
export const DIR_UPLOADS = join(process.cwd(), 'uploads');
export const DIR_UPLOADS_PRODUCTOS = join(DIR_UPLOADS, 'productos');

// Prefijo de URL publica bajo el que se exponen los archivos de DIR_UPLOADS.
export const PREFIJO_UPLOADS = '/uploads';
