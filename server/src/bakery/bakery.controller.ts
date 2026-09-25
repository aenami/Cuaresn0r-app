import {
  Body,
  Controller,
  Get,
  Patch,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { Area } from '../auth/decorators/area.decorator';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { BakeryService } from './bakery.service';
import {
  CrearArticuloPanaderiaDto,
  CrearRecetaPanaderiaDto,
  ActualizarArticuloPanaderiaDto,
  CrearTransferenciaPanaderiaDto,
  ConfirmarIngresoTransferenciaDto,
  CrearVentaPanaderiaDto,
  EntradaPanaderiaDto,
  RegistrarConteoPanaderiaDto,
} from './dto';
import { CreateCajaDto } from '../billing/dto/create-caja.dto';

@Roles('ADMIN', 'CAJERO')
@Area('PANADERIA')
@Controller('/bakery')
export class BakeryController {
  constructor(private readonly bakery: BakeryService) {}

  @Get('articulos')
  listarArticulos() { return this.bakery.listarArticulos(); }

  @Get('recetas')
  listarRecetas() { return this.bakery.listarRecetas(); }

  @Roles('ADMIN')
  @Post('recetas')
  crearReceta(@Body() dto: CrearRecetaPanaderiaDto) { return this.bakery.crearReceta(dto); }

  @Roles('ADMIN')
  @Patch('recetas/:id/desactivar')
  desactivarReceta(@Param('id', ParseIntPipe) id: number) { return this.bakery.desactivarReceta(id); }

  @Roles('ADMIN')
  @Post('articulos')
  crearArticulo(@Body() dto: CrearArticuloPanaderiaDto) {
    return this.bakery.crearArticulo(dto);
  }

  @Roles('ADMIN')
  @Patch('articulos/:id')
  actualizarArticulo(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarArticuloPanaderiaDto) {
    return this.bakery.actualizarArticulo(id, dto);
  }

  @Post('articulos/:id/entradas')
  registrarEntrada(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
    @Body() dto: EntradaPanaderiaDto,
  ) { return this.bakery.registrarEntrada(id, req.user.id, dto); }

  @Post('articulos/:id/mermas')
  registrarMerma(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
    @Body() dto: EntradaPanaderiaDto,
  ) { return this.bakery.registrarMerma(id, req.user.id, dto); }

  @Get('ventas')
  listarVentas(@Query('turnoId') turnoId?: string) {
    return this.bakery.listarVentas(turnoId ? Number(turnoId) : undefined);
  }

  @Post('ventas')
  crearVenta(@Req() req: AuthenticatedRequest, @Body() dto: CrearVentaPanaderiaDto) {
    return this.bakery.crearVenta(req.user.id, dto);
  }

  @Get('conteo')
  estadoConteo() { return this.bakery.estadoConteo(); }

  @Post('conteo/:id')
  registrarConteo(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
    @Body() dto: RegistrarConteoPanaderiaDto,
  ) { return this.bakery.registrarConteo(id, req.user.id, dto); }

  @Get('cajas')
  listarCajas() { return this.bakery.listarCajas(); }

  @Roles('ADMIN')
  @Post('cajas')
  crearCaja(@Body() dto: CreateCajaDto) { return this.bakery.crearCaja(dto.nombre); }

  @Get('transferencias')
  @Area('AMBAS')
  listarTransferencias() { return this.bakery.listarTransferencias(); }

  @Roles('ADMIN')
  @Post('transferencias')
  crearTransferencia(@Req() req: AuthenticatedRequest, @Body() dto: CrearTransferenciaPanaderiaDto) {
    return this.bakery.crearTransferencia(req.user.id, dto);
  }

  @Post('transferencias/:id/recibir')
  @Area('RESTAURANTE')
  recibirTransferencia(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest) {
    return this.bakery.recibirTransferencia(id, req.user.id);
  }

  @Post('transferencias/:id/confirmar-ingreso')
  confirmarIngresoTransferencia(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
    @Body() dto: ConfirmarIngresoTransferenciaDto,
  ) { return this.bakery.confirmarIngresoTransferencia(id, req.user.id, dto); }
}
