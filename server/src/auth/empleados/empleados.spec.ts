import { ConflictException } from '@nestjs/common';
import { EmpleadosService } from './empleados.service';
import { PrismaService } from '../../prisma/prisma.service';

// Proteccion del ultimo admin desde el otro flanco: desactivar el empleado de un
// admin le revoca el acceso (el login exige empleado ACTIVO). No se puede dejar
// el sistema sin ningun administrador activo. Prisma simulado.

function setup(
  opts: {
    usuarioAdmin?: { id_usuario: number } | null;
    adminsActivos?: number;
  } = {},
) {
  const { usuarioAdmin = { id_usuario: 1 }, adminsActivos = 1 } = opts;
  const spies = {
    empleadoFindUnique: jest
      .fn()
      .mockResolvedValue({ id_empleado: 1, estado_empleado: 'ACTIVO' }),
    usuarioFindFirst: jest.fn().mockResolvedValue(usuarioAdmin),
    usuarioCount: jest.fn().mockResolvedValue(adminsActivos),
    empleadoUpdate: jest.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id_empleado: 1, ...args.data }),
    ),
    queryRaw: jest.fn().mockResolvedValue([{ id_rol: 1 }]),
  };
  const prisma = {
    empleado: {
      findUnique: spies.empleadoFindUnique,
      update: spies.empleadoUpdate,
    },
    usuario: { findFirst: spies.usuarioFindFirst, count: spies.usuarioCount },
  } as unknown as PrismaService;
  Object.assign(prisma, {
    $queryRaw: spies.queryRaw,
    $transaction: jest.fn((callback: (tx: PrismaService) => unknown) =>
      callback(prisma),
    ),
  });
  return { svc: new EmpleadosService(prisma), spies };
}

describe('EmpleadosService.deactivate (proteccion del ultimo admin)', () => {
  it('409 al desactivar al empleado del unico admin activo', async () => {
    const { svc, spies } = setup({
      usuarioAdmin: { id_usuario: 1 },
      adminsActivos: 1,
    });
    await expect(svc.deactivate(1)).rejects.toBeInstanceOf(ConflictException);
    expect(spies.empleadoUpdate).not.toHaveBeenCalled();
    expect(spies.queryRaw).toHaveBeenCalledTimes(1);
  });

  it('desactiva al admin cuando queda otro admin activo', async () => {
    const { svc, spies } = setup({
      usuarioAdmin: { id_usuario: 1 },
      adminsActivos: 2,
    });
    await svc.deactivate(1);
    expect(spies.empleadoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estado_empleado: 'INACTIVO' }),
      }),
    );
  });

  it('desactiva a un empleado sin usuario admin sin contar admins', async () => {
    const { svc, spies } = setup({ usuarioAdmin: null });
    await svc.deactivate(1);
    expect(spies.empleadoUpdate).toHaveBeenCalledTimes(1);
    expect(spies.usuarioCount).not.toHaveBeenCalled();
  });
});
