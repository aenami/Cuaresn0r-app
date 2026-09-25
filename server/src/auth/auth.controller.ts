import {
  Controller,
  Get,
  Post,
  Body,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateAuthDto } from './dto/create-auth.dto';
import { TokenService } from '../common/token/token.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { Public } from './decorators/public.decorator';
import { Roles } from './decorators/roles.decorator';

@Controller('/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokenService: TokenService,
    private readonly cryptoService: CryptoService
    ) {}

  @Public()
  @Post('/login')
  // El DTO valida que el backend reciba los datos correctamente
  async loginUser(@Body() createAuthDto: CreateAuthDto) {
    // 1. Validar que el usuario exista en la db
    const result = await this.authService.findUser(createAuthDto);
    // Mismo mensaje para "no existe" y "password incorrecta": evita que alguien
    // use este endpoint para averiguar que emails estan registrados.
    if(!result) throw new UnauthorizedException('Credenciales invalidas')

    // 2. El empleado asociado debe seguir activo (retiro = acceso revocado de inmediato)
    if(!result.empleadoActivo) throw new UnauthorizedException('El usuario esta inactivo')

    // 3. Comparar contraseña ingresada con la de la DB
    const passwordValid = await this.cryptoService.compareHash(createAuthDto.password, result.password)
    if(!passwordValid) throw new UnauthorizedException('Credenciales invalidas')

    // 4. Generamos token de login exitoso
    const token = this.tokenService.generateToken(result.id, result.idRol, result.rolNombre, result.area)
    // 5. Devolvemos el token de inicio de sesion
    return {token}
  }

  // Solo lectura: los roles del sistema son fijos (ver roles.constants.ts).
  // Este listado existe para elegir idRol al crear/editar usuarios.
  @Roles('ADMIN')
  @Get('/roles')
  findRoles() {
    return this.authService.findRoles();
  }
}
