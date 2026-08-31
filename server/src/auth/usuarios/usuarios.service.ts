import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Prisma } from '../../generated/prisma/client';

// Selecciona todo excepto password_usuario: nunca debe salir del backend.
const SAFE_SELECT = {
  id_usuario: true,
  email_usuario: true,
  fecha_creacion_usuario: true,
  empleado: {
    select: { id_empleado: true, nombre_empleado: true, apellido_empleado: true, estado_empleado: true },
  },
  rol: {
    select: { id_rol: true, nombre_rol: true },
  },
} satisfies Prisma.UsuarioSelect;

@Injectable()
export class UsuariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoService: CryptoService,
  ) {}

  async create(dto: CreateUsuarioDto) {
    const empleado = await this.prisma.empleado.findUnique({ where: { id_empleado: dto.idEmpleado } });
    if (!empleado) throw new NotFoundException('El empleado indicado no existe');
    if (empleado.estado_empleado !== 'ACTIVO') {
      throw new ConflictException('No se puede crear un usuario para un empleado inactivo');
    }

    const rol = await this.prisma.rol.findUnique({ where: { id_rol: dto.idRol } });
    if (!rol) throw new NotFoundException('El rol indicado no existe');

    const hashedPassword = await this.cryptoService.hashPassword(dto.password);

    try {
      return await this.prisma.usuario.create({
        data: {
          id_empleado_usuario: dto.idEmpleado,
          id_rol: dto.idRol,
          email_usuario: dto.email,
          password_usuario: hashedPassword,
        },
        select: SAFE_SELECT,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya existe un usuario con ese email');
      }
      throw error;
    }
  }

  async findAll() {
    return this.prisma.usuario.findMany({ select: SAFE_SELECT, orderBy: { id_usuario: 'asc' } });
  }

  async findOne(id: number) {
    const usuario = await this.prisma.usuario.findUnique({ where: { id_usuario: id }, select: SAFE_SELECT });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');
    return usuario;
  }

  // Admins con acceso efectivo: rol ADMIN y empleado ACTIVO (el JwtAuthGuard
  // exige ambos en cada request). El sistema nunca debe quedarse sin ninguno.
  private async contarAdminsActivos(): Promise<number> {
    return this.prisma.usuario.count({
      where: { rol: { nombre_rol: 'ADMIN' }, empleado: { estado_empleado: 'ACTIVO' } },
    });
  }

  // Bloquea una operacion (degradar/eliminar) que quitaria el acceso de admin
  // al usuario dado si resulta ser el ultimo administrador activo.
  private async assertNoEsUltimoAdmin(usuario: {
    rol: { nombre_rol: string } | null
    empleado: { estado_empleado: string } | null
  }) {
    const esAdminActivo = usuario.rol?.nombre_rol === 'ADMIN' && usuario.empleado?.estado_empleado === 'ACTIVO';
    if (!esAdminActivo) return;
    if ((await this.contarAdminsActivos()) <= 1) {
      throw new ConflictException('No puedes dejar el sistema sin un administrador activo: este es el ultimo ADMIN.');
    }
  }

  async update(id: number, dto: UpdateUsuarioDto) {
    const actual = await this.findOne(id);
    if (dto.idRol !== undefined) {
      const rol = await this.prisma.rol.findUnique({ where: { id_rol: dto.idRol } });
      if (!rol) throw new NotFoundException('El rol indicado no existe');
      // Cambiar el rol del ultimo admin a uno sin privilegios dejaria el
      // sistema sin administrador.
      if (rol.nombre_rol !== 'ADMIN') await this.assertNoEsUltimoAdmin(actual);
    }

    try {
      return await this.prisma.usuario.update({
        where: { id_usuario: id },
        data: {
          ...(dto.email !== undefined && { email_usuario: dto.email }),
          ...(dto.idRol !== undefined && { id_rol: dto.idRol }),
        },
        select: SAFE_SELECT,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya existe un usuario con ese email');
      }
      throw error;
    }
  }

  async remove(id: number) {
    const actual = await this.findOne(id);
    // Eliminar al ultimo admin activo dejaria el sistema sin administrador.
    await this.assertNoEsUltimoAdmin(actual);
    try {
      await this.prisma.usuario.delete({ where: { id_usuario: id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException(
          'Este usuario ya tiene actividad registrada (pedidos, turnos, etc.) y no se puede eliminar. Desactiva su Empleado en su lugar.',
        );
      }
      throw error;
    }
  }

  // Reseteo administrativo: el ADMIN fija una clave nueva sin conocer la actual.
  async resetPassword(id: number, dto: ResetPasswordDto) {
    await this.findOne(id);
    const hashedPassword = await this.cryptoService.hashPassword(dto.newPassword);
    await this.prisma.usuario.update({
      where: { id_usuario: id },
      data: { password_usuario: hashedPassword },
    });
    return { message: 'Contraseña restablecida correctamente' };
  }

  async changeOwnPassword(id: number, dto: ChangePasswordDto) {
    const usuario = await this.prisma.usuario.findUnique({ where: { id_usuario: id } });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    const currentValid = await this.cryptoService.compareHash(dto.currentPassword, usuario.password_usuario);
    if (!currentValid) throw new UnauthorizedException('La contraseña actual es incorrecta');

    const hashedPassword = await this.cryptoService.hashPassword(dto.newPassword);
    await this.prisma.usuario.update({
      where: { id_usuario: id },
      data: { password_usuario: hashedPassword },
    });
    return { message: 'Contraseña actualizada correctamente' };
  }
}
