import { SetMetadata } from '@nestjs/common';
import { RolSistema } from '../roles.constants';

export const ROLES_KEY = 'roles';

// Restringe una ruta a los roles del sistema indicados (ej. @Roles('ADMIN')).
// Tipado contra RolSistema: un typo en el nombre no compila.
// Sin este decorator, cualquier usuario autenticado puede acceder.
export const Roles = (...roles: RolSistema[]) => SetMetadata(ROLES_KEY, roles);
