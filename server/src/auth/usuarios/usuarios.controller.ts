import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe, Req } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Roles } from '../decorators/roles.decorator';
import { Area } from '../decorators/area.decorator';
import { AuthenticatedRequest } from '../types/authenticated-request';

@Controller('/auth/usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Roles('ADMIN')
  @Post()
  create(@Body() createUsuarioDto: CreateUsuarioDto) {
    return this.usuariosService.create(createUsuarioDto);
  }

  @Roles('ADMIN')
  @Get()
  findAll() {
    return this.usuariosService.findAll();
  }

  // Declarado antes de ':id' para que Nest no intente matchear "me" como :id.
  // Sin @Roles(): cualquier usuario autenticado puede ver su propio perfil.
  @Get('me')
  @Area('AMBAS')
  findMe(@Req() req: AuthenticatedRequest) {
    return this.usuariosService.findOne(req.user.id);
  }

  @Patch('me/password')
  @Area('AMBAS')
  changeOwnPassword(@Req() req: AuthenticatedRequest, @Body() changePasswordDto: ChangePasswordDto) {
    return this.usuariosService.changeOwnPassword(req.user.id, changePasswordDto);
  }

  @Roles('ADMIN')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usuariosService.findOne(id);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() updateUsuarioDto: UpdateUsuarioDto) {
    return this.usuariosService.update(id, updateUsuarioDto);
  }

  // Declarado despues de 'me/password' (arriba) para que "me" no caiga aqui.
  @Roles('ADMIN')
  @Patch(':id/password')
  resetPassword(@Param('id', ParseIntPipe) id: number, @Body() resetPasswordDto: ResetPasswordDto) {
    return this.usuariosService.resetPassword(id, resetPasswordDto);
  }

  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.usuariosService.remove(id);
  }
}
