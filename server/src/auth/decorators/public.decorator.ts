import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Marca una ruta como exenta del JwtAuthGuard global (ej. login).
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
