import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { EmpleadosController } from './empleados/empleados.controller';
import { EmpleadosService } from './empleados/empleados.service';
import { UsuariosController } from './usuarios/usuarios.controller';
import { UsuariosService } from './usuarios/usuarios.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { CryptoModule } from '../common/crypto/crypto.module';
import { TokenModule } from '../common/token/token.module';

@Module({
  imports: [CryptoModule, TokenModule],
  controllers: [AuthController, EmpleadosController, UsuariosController],
  providers: [
    AuthService,
    EmpleadosService,
    UsuariosService,
    // Globales: JwtAuthGuard exige token valido en toda ruta salvo @Public(),
    // RolesGuard exige el rol de @Roles(...) cuando la ruta lo declara.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
