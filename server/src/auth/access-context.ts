import { AsyncLocalStorage } from 'node:async_hooks';
import { ForbiddenException } from '@nestjs/common';
import { AreaNegocio } from '../generated/prisma/client';
import { AuthTokenPayload } from '../common/token/token.service';

export const accessContext = new AsyncLocalStorage<{
  user: AuthTokenPayload;
  area: AreaNegocio;
}>();
export const esGlobal = (rol: string) =>
  rol === 'ADMIN_GLOBAL' || rol === 'ADMIN';
export const esAdministrador = (rol: string) =>
  esGlobal(rol) || rol === 'ADMIN_LOCAL';
export function areaActual(): AreaNegocio {
  return accessContext.getStore()?.area ?? 'RESTAURANTE';
}
export function exigirArea(area: AreaNegocio) {
  if (accessContext.getStore() && area !== areaActual())
    throw new ForbiddenException(
      'El registro pertenece a otra área del negocio',
    );
}
export function exigirRolAsignable(rol: string, area: AreaNegocio) {
  const actor = accessContext.getStore()?.user;
  if (
    actor &&
    !esGlobal(actor.rolNombre) &&
    (esGlobal(rol) || area !== actor.area)
  )
    throw new ForbiddenException(
      'Solo el administrador global puede asignar ese acceso',
    );
  if (
    (rol === 'PANADERO' && area !== 'PANADERIA') ||
    (['MESERO', 'COCINERO'].includes(rol) && area !== 'RESTAURANTE')
  )
    throw new ForbiddenException('El rol seleccionado no corresponde al área');
}
