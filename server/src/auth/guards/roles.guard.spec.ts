import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AREA_KEY } from '../decorators/area.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

function autorizar(rolNombre: string, areaUsuario: string, areaRuta?: string) {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) =>
      key === ROLES_KEY
        ? ['ADMIN', 'CAJERO']
        : key === AREA_KEY
          ? areaRuta
          : undefined,
    ),
  } as unknown as Reflector;
  const contexto = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user: { rolNombre, area: areaUsuario } }),
    }),
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

describe('RolesGuard matriz de acceso', () => {
  function solicitud(
    rolNombre: string,
    area: string,
    path: string,
    method: string,
    roles?: string[],
    areaRuta = 'AMBAS',
    solicitada?: string,
  ) {
    const req = {
      user: { id: 1, rolNombre, area },
      path,
      method,
      headers: solicitada ? { 'x-area-negocio': solicitada } : {},
      query: {},
    };
    const reflector = {
      getAllAndOverride: (key: string) =>
        key === ROLES_KEY ? roles : key === AREA_KEY ? areaRuta : undefined,
    } as Reflector;
    const contexto = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    return () => new RolesGuard(reflector).canActivate(contexto);
  }

  it.each([
    ['/billing/turnos', 'POST'],
    ['/orders', 'GET'],
    ['/billing/facturas', 'POST'],
    ['/billing/pagos', 'POST'],
    ['/bakery/ventas', 'POST'],
    ['/bakery/remisiones/entregas', 'POST'],
    ['/billing/cuentas-por-pagar/1/pagos', 'POST'],
    ['/payroll/empleados/1/pagos', 'POST'],
    ['/interarea/restaurante-panaderia/1/pagar', 'POST'],
  ])('el global no puede operar %s %s', (path, method) => {
    expect(
      solicitud('ADMIN_GLOBAL', 'RESTAURANTE', path, method, [
        'ADMIN',
        'CAJERO',
      ]),
    ).toThrow(ForbiddenException);
  });

  it('el global puede consultar cierres, cuentas e inventario de ambas áreas', () => {
    for (const path of [
      '/billing/turnos',
      '/billing/cuentas-por-pagar',
      '/bakery/articulos',
    ]) {
      expect(
        solicitud(
          'ADMIN_GLOBAL',
          'RESTAURANTE',
          path,
          'GET',
          ['ADMIN', 'CAJERO'],
          'AMBAS',
          'PANADERIA',
        )(),
      ).toBe(true);
    }
  });

  it.each(['ADMIN_LOCAL', 'CAJERO', 'PANADERO'])(
    'no admite manipular el selector con rol %s',
    (rol) => {
      expect(
        solicitud(
          rol,
          'PANADERIA',
          '/auth/usuarios',
          'GET',
          [rol],
          'AMBAS',
          'RESTAURANTE',
        ),
      ).toThrow(ForbiddenException);
    },
  );

  it('un administrador local no entra en el negocio contrario', () => {
    expect(
      solicitud(
        'ADMIN_LOCAL',
        'PANADERIA',
        '/catalog/productos',
        'GET',
        ['ADMIN'],
        'RESTAURANTE',
      ),
    ).toThrow(ForbiddenException);
  });

  it('el panadero puede inventario pero no ventas ni proveedores', () => {
    expect(
      solicitud(
        'PANADERO',
        'PANADERIA',
        '/bakery/articulos',
        'GET',
        ['ADMIN', 'PANADERO', 'CAJERO'],
        'PANADERIA',
      )(),
    ).toBe(true);
    expect(
      solicitud(
        'PANADERO',
        'PANADERIA',
        '/bakery/ventas',
        'POST',
        ['ADMIN_LOCAL', 'CAJERO'],
        'PANADERIA',
      ),
    ).toThrow(ForbiddenException);
    expect(
      solicitud('PANADERO', 'PANADERIA', '/billing/proveedores', 'GET', [
        'ADMIN',
        'CAJERO',
      ]),
    ).toThrow(ForbiddenException);
  });

  it('el mesero no entra a conteo diario ni nómina ajena', () => {
    expect(
      solicitud('MESERO', 'RESTAURANTE', '/recipes/inventory-counts', 'GET', [
        'ADMIN',
        'CAJERO',
        'COCINERO',
      ]),
    ).toThrow(ForbiddenException);
    expect(
      solicitud('MESERO', 'RESTAURANTE', '/payroll/empleados/2/saldo', 'GET', [
        'ADMIN',
        'CAJERO',
      ]),
    ).toThrow(ForbiddenException);
    expect(solicitud('MESERO', 'RESTAURANTE', '/payroll/me', 'GET')()).toBe(
      true,
    );
  });
});
