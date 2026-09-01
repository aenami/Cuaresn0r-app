import { ConflictException } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';

// Proteccion del ultimo admin: el sistema nunca debe quedarse sin un usuario
// con rol ADMIN y empleado ACTIVO (el JwtAuthGuard exige ambos). Se prueban las
// dos operaciones de UsuariosService que podrian romper la invariante: degradar
// el rol y eliminar el usuario. Prisma simulado.

const adminActivo = {
  rol: { id_rol: 1, nombre_rol: 'ADMIN' },
  empleado: { id_empleado: 1, estado_empleado: 'ACTIVO' },
};
const cajero = {
  rol: { id_rol: 2, nombre_rol: 'CAJERO' },
  empleado: { id_empleado: 2, estado_empleado: 'ACTIVO' },
};

function setup(
  opts: {
    usuario?: Record<string, unknown>;
    adminsActivos?: number;
    rolNuevo?: string;
  } = {},
) {
  const {
    usuario = adminActivo,
    adminsActivos = 1,
    rolNuevo = 'CAJERO',
  } = opts;
  const spies = {
    usuarioFindUnique: jest.fn().mockResolvedValue(usuario),
    rolFindUnique: jest
      .fn()
      .mockResolvedValue({ id_rol: 2, nombre_rol: rolNuevo }),
    usuarioCount: jest.fn().mockResolvedValue(adminsActivos),
    usuarioUpdate: jest.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id_usuario: 1, ...args.data }),
    ),
    usuarioDelete: jest.fn().mockResolvedValue({}),
    queryRaw: jest.fn().mockResolvedValue([{ id_rol: 1 }]),
  };
  const prisma = {
    usuario: {
      findUnique: spies.usuarioFindUnique,
      count: spies.usuarioCount,
      update: spies.usuarioUpdate,
      delete: spies.usuarioDelete,
    },
    rol: { findUnique: spies.rolFindUnique },
  } as unknown as PrismaService;
  Object.assign(prisma, {
    $queryRaw: spies.queryRaw,
    $transaction: jest.fn((callback: (tx: PrismaService) => unknown) =>
      callback(prisma),
    ),
  });
  return { svc: new UsuariosService(prisma, {} as CryptoService), spies };
}

const dto = (idRol?: number) => ({ idRol }) as unknown as UpdateUsuarioDto;

describe('UsuariosService.update (proteccion del ultimo admin)', () => {
  it('409 al degradar el rol del unico admin activo', async () => {
    const { svc, spies } = setup({ adminsActivos: 1, rolNuevo: 'CAJERO' });
    await expect(svc.update(1, dto(2))).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(spies.usuarioUpdate).not.toHaveBeenCalled();
    expect(spies.queryRaw).toHaveBeenCalledTimes(1);
  });

  it('permite degradar un admin cuando hay otro admin activo', async () => {
    const { svc, spies } = setup({ adminsActivos: 2, rolNuevo: 'CAJERO' });
    await svc.update(1, dto(2));
    expect(spies.usuarioUpdate).toHaveBeenCalledTimes(1);
  });

  it('permite reasignar al mismo rol ADMIN aunque sea el ultimo', async () => {
    const { svc, spies } = setup({ adminsActivos: 1, rolNuevo: 'ADMIN' });
    await svc.update(1, dto(1));
    expect(spies.usuarioUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('UsuariosService.remove (proteccion del ultimo admin)', () => {
  it('409 al eliminar el unico admin activo', async () => {
    const { svc, spies } = setup({ adminsActivos: 1 });
    await expect(svc.remove(1)).rejects.toBeInstanceOf(ConflictException);
    expect(spies.usuarioDelete).not.toHaveBeenCalled();
    expect(spies.queryRaw).toHaveBeenCalledTimes(1);
  });

  it('elimina un usuario que no es admin sin contar admins', async () => {
    const { svc, spies } = setup({ usuario: cajero });
    await svc.remove(2);
    expect(spies.usuarioDelete).toHaveBeenCalledTimes(1);
    expect(spies.usuarioCount).not.toHaveBeenCalled();
  });
});
