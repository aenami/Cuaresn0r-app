import { Injectable } from '@nestjs/common';
import { CreateAuthDto } from './dto/create-auth.dto';
import { PrismaService } from '../prisma/prisma.service'

interface AuthenticatedUserData {
  id: number;
  password: string;
  idRol: number;
  rolNombre: string;
  empleadoActivo: boolean;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async findUser(authDto: CreateAuthDto): Promise<AuthenticatedUserData | false> {
    const user = await this.prisma.usuario.findFirst({
      where: {
        email_usuario: authDto.email,
      },
      include: {
        rol: true,
        empleado: true,
      },
    })

    if(!user) return false
    return {
      id: user.id_usuario,
      password: user.password_usuario,
      idRol: user.id_rol,
      rolNombre: user.rol.nombre_rol,
      empleadoActivo: user.empleado.estado_empleado === 'ACTIVO',
    }
  }

  async findRoles() {
    return this.prisma.rol.findMany({ orderBy: { id_rol: 'asc' } });
  }
}
