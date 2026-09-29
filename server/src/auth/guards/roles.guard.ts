import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedRequest } from '../types/authenticated-request';
import { AREA_KEY } from '../decorators/area.decorator';
import { AreaNegocio } from '../../generated/prisma/client';
import { esAdministrador, esGlobal } from '../access-context';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const { user } = req;
    if (!user) return true; // JwtAuthGuard ya rechazó las rutas no públicas.
    if (
      requiredRoles?.length &&
      !requiredRoles.some(
        (rol) =>
          rol === user.rolNombre ||
          (rol === 'ADMIN' && esAdministrador(user.rolNombre)),
      )
    ) {
      throw new ForbiddenException(
        'No tienes permisos para realizar esta accion',
      );
    }
    // Las rutas heredadas pertenecen al restaurante. Solo las que declaran
    // un area distinta o compartida quedan disponibles al cajero de panaderia.
    const area =
      this.reflector.getAllAndOverride<AreaNegocio | 'AMBAS'>(AREA_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'RESTAURANTE';
    if (!esGlobal(user.rolNombre) && area !== 'AMBAS' && area !== user.area)
      throw new ForbiddenException(
        'Esta accion pertenece a otra area del negocio',
      );
    const solicitada = req.query?.area ?? req.headers?.['x-area-negocio'];
    if (
      solicitada !== undefined &&
      solicitada !== 'RESTAURANTE' &&
      solicitada !== 'PANADERIA'
    )
      throw new ForbiddenException('Área inválida');
    if (solicitada && !esGlobal(user.rolNombre) && solicitada !== user.area)
      throw new ForbiddenException('No puedes consultar otra área');
    req.areaSeleccionada = (solicitada as AreaNegocio | undefined) ?? user.area;

    const path = req.path ?? '';
    const lectura = req.method === 'GET';
    // El perfil propio mantiene la sesión y permite cambiar la contraseña;
    // no equivale a acceso a la administración de usuarios o a mi nómina.
    const perfilPropio =
      (lectura && /^\/auth\/usuarios\/me\/?$/.test(path)) ||
      (req.method === 'PATCH' &&
        /^\/auth\/usuarios\/me\/password\/?$/.test(path));
    if (
      esGlobal(user.rolNombre) &&
      (/^\/(payroll|catalog|printing)(\/|$)/.test(path) ||
        (/^\/auth\/(usuarios|roles|empleados)(\/|$)/.test(path) &&
          !perfilPropio) ||
        (req.method === 'POST' && /^\/bakery\/articulos\/?$/.test(path)) ||
        (['PATCH', 'DELETE'].includes(req.method) &&
          /^\/bakery\/articulos\/\d+\/?$/.test(path)))
    )
      throw new ForbiddenException(
        'El administrador global no tiene acceso a este módulo',
      );
    // El administrador global supervisa: ni una llamada directa a la API le
    // permite emitir ventas, abrir caja, pagar o preparar pedidos.
    if (
      esGlobal(user.rolNombre) &&
      (/^\/(orders|billing\/(facturas|pagos))(\/|$)/.test(path) ||
        (!lectura &&
          /^\/(billing\/(turnos|movimientos)|bakery\/(ventas|transferencias|remisiones)|interarea|payroll\/empleados\/\d+\/pagos)/.test(
            path,
          )) ||
        (!lectura && /^\/billing\/cuentas-por-pagar\/\d+\/pagos/.test(path)))
    )
      throw new ForbiddenException(
        'El administrador global supervisa; no puede cobrar, facturar ni operar caja',
      );
    // Las rutas de catálogo se consultan también desde la toma de pedidos;
    // eso no concede acceso al módulo de administración del catálogo.
    if (!requiredRoles?.length && path && !esAdministrador(user.rolNombre)) {
      const permitido =
        /^(\/auth\/usuarios\/me|\/payroll\/me)(\/|$)/.test(path) ||
        (['CAJERO', 'MESERO', 'COCINERO'].includes(user.rolNombre) &&
          /^\/(orders|fichas|catalog|recipes)(\/|$)/.test(path));
      if (!permitido)
        throw new ForbiddenException('No tienes acceso a este módulo');
    }
    return true;
  }
}
