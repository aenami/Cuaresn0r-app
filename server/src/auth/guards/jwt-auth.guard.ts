import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TokenService } from '../../common/token/token.service';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthenticatedRequest } from '../types/authenticated-request';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('Token no proporcionado');

    const payload = this.tokenService.verifyToken(token);

    // La firma del token solo prueba QUIEN es; sus privilegios vigentes se
    // leen de la DB en cada request. Asi, desactivar un empleado o cambiarle
    // el rol surte efecto inmediato sobre las sesiones ya iniciadas, sin
    // esperar a que el token expire (1h).
    const usuario = await this.prisma.usuario.findUnique({
      where: { id_usuario: payload.id },
      include: { rol: true, empleado: true },
    });
    if (!usuario) throw new UnauthorizedException('El usuario ya no existe');
    if (usuario.empleado.estado_empleado !== 'ACTIVO') {
      throw new UnauthorizedException('El usuario esta inactivo');
    }

    request.user = { id: usuario.id_usuario, idRol: usuario.id_rol, rolNombre: usuario.rol.nombre_rol };
    return true;
  }

  private extractToken(request: AuthenticatedRequest): string | undefined {
    const header = request.headers.authorization;
    if (!header) return undefined;
    const [type, token] = header.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
