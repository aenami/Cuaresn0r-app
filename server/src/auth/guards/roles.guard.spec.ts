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

  const modulosRestringidos = [
    ['/auth/usuarios', 'GET'],
    ['/auth/usuarios/1', 'GET'],
    ['/auth/usuarios/1/password', 'PATCH'],
    ['/auth/usuarios/me/password', 'GET'],
    ['/auth/usuarios/me/otro', 'GET'],
    ['/auth/roles', 'GET'],
    ['/auth/empleados', 'GET'],
    ['/auth/empleados/1', 'PATCH'],
    ['/payroll/me/resumen', 'GET'],
    ['/payroll/empleados/1/saldo', 'GET'],
    ['/payroll/config', 'PATCH'],
    ['/catalog/products', 'GET'],
    ['/catalog/uploads', 'POST'],
    ['/printing/impresoras', 'GET'],
    ['/printing/impresoras/1/test', 'POST'],
    ['/printing/comandas/1/reimprimir', 'POST'],
    ['/printing/facturas/1', 'POST'],
    ['/bakery/articulos', 'POST'],
    ['/bakery/articulos/1', 'PATCH'],
    ['/bakery/articulos/1', 'DELETE'],
  ];

  for (const rol of ['ADMIN_GLOBAL', 'ADMIN']) {
    for (const area of ['RESTAURANTE', 'PANADERIA']) {
      it.each(modulosRestringidos)(
        `${rol} no accede a %s %s seleccionando ${area}`,
        (path, method) => {
          expect(
            solicitud(
              rol,
              'RESTAURANTE',
              path,
              method,
              ['ADMIN'],
              'AMBAS',
              area,
            ),
          ).toThrow(ForbiddenException);
        },
      );

      it(`${rol} conserva su perfil, contraseña e inventario en ${area}`, () => {
        for (const [path, method] of [
          ['/auth/usuarios/me', 'GET'],
          ['/auth/usuarios/me/password', 'PATCH'],
          ['/recipes/ingredients', 'GET'],
          ['/recipes/inventory-counts', 'GET'],
          ['/bakery/articulos', 'GET'],
          ['/bakery/articulos/1/entradas', 'POST'],
          ['/bakery/articulos/1/mermas', 'POST'],
          ['/bakery/recetas', 'GET'],
          ['/bakery/recetas', 'POST'],
          ['/reports', 'GET'],
          ['/billing/turnos', 'GET'],
          ['/billing/proveedores', 'GET'],
          ['/bakery/remisiones', 'GET'],
        ]) {
          expect(
            solicitud(
              rol,
              'RESTAURANTE',
              path,
              method,
              ['ADMIN'],
              'AMBAS',
              area,
            )(),
          ).toBe(true);
        }
      });
    }
  }

  it.each(modulosRestringidos)(
    'el administrador local conserva %s %s en su área',
    (path, method) => {
      expect(
        solicitud(
          'ADMIN_LOCAL',
          'PANADERIA',
          path,
          method,
          ['ADMIN'],
          'AMBAS',
        )(),
      ).toBe(true);
    },
  );

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
