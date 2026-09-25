import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AREA_KEY } from '../decorators/area.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

function autorizar(rolNombre: string, areaUsuario: string, areaRuta?: string) {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) => key === ROLES_KEY
      ? ['ADMIN', 'CAJERO'] : key === AREA_KEY ? areaRuta : undefined),
  } as unknown as Reflector;
  const contexto = {
    getHandler: () => ({}), getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user: { rolNombre, area: areaUsuario } }) }),
  } as unknown as ExecutionContext;
  return () => new RolesGuard(reflector).canActivate(contexto);
}

describe('RolesGuard por area', () => {
  it('un cajero de panaderia no entra a rutas heredadas de restaurante', () => {
    expect(autorizar('CAJERO', 'PANADERIA')).toThrow(ForbiddenException);
  });

  it('un cajero de panaderia accede a su area y rutas compartidas', () => {
    expect(autorizar('CAJERO', 'PANADERIA', 'PANADERIA')()).toBe(true);
    expect(autorizar('CAJERO', 'PANADERIA', 'AMBAS')()).toBe(true);
  });

  it('un administrador consulta ambas areas', () => {
    expect(autorizar('ADMIN', 'RESTAURANTE', 'PANADERIA')()).toBe(true);
  });
});
