import { Injectable, UnauthorizedException } from '@nestjs/common';
import jwt from 'jsonwebtoken'

export interface AuthTokenPayload {
  id: number;
  idRol: number;
  rolNombre: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class TokenService {

  generateToken(idUser: number, idRol: number, rolNombre: string){
    // Payload base que viaja dentro del JWT para identificar al usuario autenticado.
    // idRol/rolNombre son solo informativos para el cliente: la autoridad es la DB,
    // que JwtAuthGuard consulta en cada request (un cambio de rol o el retiro del
    // empleado surten efecto inmediato, sin esperar a que el token expire).
    const payload: AuthTokenPayload = {
      id: idUser,
      idRol,
      rolNombre,
    };

    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET!, // Le decimos a TypeScript que esta variable siempre debe existir.
      { expiresIn: '1h' }
    )
    return token
  }

  verifyToken(token: string): AuthTokenPayload {
    // Verificamos firma y expiracion del token antes de permitir acceso a rutas privadas.
    try {
      const decodedToken = jwt.verify(token, process.env.JWT_SECRET!) as AuthTokenPayload

      if (typeof decodedToken !== "object" || typeof decodedToken.id !== "number") {
        throw new UnauthorizedException("Token invalido")
      }

      return decodedToken
    } catch {
      throw new UnauthorizedException("Token invalido o expirado")
    }
  }

}
