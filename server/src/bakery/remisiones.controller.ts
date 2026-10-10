import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Patch,
  Req,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { Area } from '../auth/decorators/area.decorator';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import {
  EntregaRemisionDto,
  EntregaListaRemisionDto,
  EditarLineaRemisionDto,
} from './dto';
import { RemisionesService } from './remisiones.service';

@Controller('/bakery/remisiones')
@Area('AMBAS')
@Roles('ADMIN', 'CAJERO')
export class RemisionesController {
  constructor(private readonly remisiones: RemisionesService) {}
  @Get() listar() {
    return this.remisiones.listar();
  }
  @Get('destinos') destinos() {
    return this.remisiones.destinos();
  }
  @Post('entregas')
  @Roles('ADMIN_LOCAL', 'CAJERO')
  entregar(@Req() req: AuthenticatedRequest, @Body() dto: EntregaRemisionDto) {
    return this.remisiones.entregar(req.user.id, dto);
  }
  @Post('lista')
  @Roles('ADMIN_LOCAL', 'CAJERO')
  entregarLista(
    @Req() req: AuthenticatedRequest,
    @Body() dto: EntregaListaRemisionDto,
  ) {
    return this.remisiones.entregarLista(req.user.id, dto);
  }
  @Patch('entregas/:id')
  @Roles('ADMIN_LOCAL', 'CAJERO')
  editar(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
    @Body() dto: EditarLineaRemisionDto,
  ) {
    return this.remisiones.editarLinea(id, req.user.id, dto);
  }
  @Post(':id/cerrar')
  @Roles('ADMIN_LOCAL', 'CAJERO')
  cerrar(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.remisiones.cerrar(id, req.user.id);
  }
  @Post(':id/confirmar-ingreso')
  @Roles('ADMIN_LOCAL', 'CAJERO')
  ingreso(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.remisiones.confirmarIngreso(id, req.user.id);
  }
}
