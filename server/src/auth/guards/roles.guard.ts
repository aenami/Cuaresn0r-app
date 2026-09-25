import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedRequest } from '../types/authenticated-request';
import { AREA_KEY } from '../decorators/area.decorator';
import { AreaNegocio } from '../../generated/prisma/client';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (requiredRoles?.length && (!user || !requiredRoles.includes(user.rolNombre))) {
      throw new ForbiddenException('No tienes permisos para realizar esta accion');
    }
    // Las rutas heredadas pertenecen al restaurante. Solo las que declaran
    // un area distinta o compartida quedan disponibles al cajero de panaderia.
    if (user?.rolNombre === 'CAJERO') {
      const area = this.reflector.getAllAndOverride<AreaNegocio | 'AMBAS'>(AREA_KEY, [
        context.getHandler(), context.getClass(),
      ]) ?? 'RESTAURANTE';
      if (area !== 'AMBAS' && area !== user.area)
        throw new ForbiddenException('Esta accion pertenece a otra area del negocio');
    }
    return true;
  }
}
