import { ForbiddenException } from '@nestjs/common';
import {
  accessContext,
  areaActual,
  exigirArea,
  exigirRolAsignable,
} from './access-context';
import { AreaNegocio } from '../generated/prisma/client';

const contexto = (rolNombre: string, area: AreaNegocio) => ({
  user: { id: 1, idRol: 1, rolNombre, area },
  area,
});
describe('Aislamiento del contexto de acceso', () => {
  it('mantiene áreas independientes en solicitudes simultáneas', async () => {
    const consultar = (area: AreaNegocio) =>
      accessContext.run(contexto('ADMIN_LOCAL', area), async () => {
        await new Promise((resolve) => setImmediate(resolve));
        return areaActual();
      });
    expect(
      await Promise.all([consultar('PANADERIA'), consultar('RESTAURANTE')]),
    ).toEqual(['PANADERIA', 'RESTAURANTE']);
  });
  it('bloquea acceder por ID a un registro de otra área', () => {
    accessContext.run(contexto('ADMIN_LOCAL', 'PANADERIA'), () =>
      expect(() => exigirArea('RESTAURANTE')).toThrow(ForbiddenException),
    );
  });
  it('un local no puede ascender usuarios al rol global', () => {
    accessContext.run(contexto('ADMIN_LOCAL', 'PANADERIA'), () =>
      expect(() => exigirRolAsignable('ADMIN_GLOBAL', 'PANADERIA')).toThrow(
        ForbiddenException,
      ),
    );
  });
  it('el global también debe respetar la compatibilidad rol-área', () => {
    accessContext.run(contexto('ADMIN_GLOBAL', 'PANADERIA'), () => {
      expect(() => exigirRolAsignable('MESERO', 'PANADERIA')).toThrow(
        ForbiddenException,
      );
      expect(() => exigirRolAsignable('PANADERO', 'RESTAURANTE')).toThrow(
        ForbiddenException,
      );
      expect(() =>
        exigirRolAsignable('ADMIN_LOCAL', 'PANADERIA'),
      ).not.toThrow();
    });
  });
});
