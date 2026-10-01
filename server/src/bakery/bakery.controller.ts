import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
  AgregarElementoConteoPanaderiaDto,
  RegistrarConteoPanaderiaDto,
} from './dto';
import { CreateCajaDto } from '../billing/dto/create-caja.dto';

@Roles('ADMIN', 'CAJERO', 'PANADERO')
@Area('PANADERIA')
@Controller('/bakery')
export class BakeryController {
  constructor(private readonly bakery: BakeryService) {}

  @Get('articulos')
  listarArticulos() { return this.bakery.listarArticulos(); }

  @Get('recetas')
  listarRecetas() { return this.bakery.listarRecetas(); }

  @Get('recepciones')
  listarRecepciones() { return this.bakery.listarRecepciones(); }

  @Roles('ADMIN', 'PANADERO')
  @Post('recepciones/:id/recibir')
  recibirInsumos(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest) {
    return this.bakery.recibirTransferenciaRestaurante(id, req.user.id);
  }

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

  @Post('articulos/:id/salidas')
  registrarSalidaManual(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
    @Body() dto: EntradaPanaderiaDto,
  ) { return this.bakery.registrarSalidaManual(id, req.user.id, dto); }

  @Get('articulos/:id/movimientos')
  listarMovimientosArticulo(@Param('id', ParseIntPipe) id: number, @Query('limit') limite?: string) {
    const cantidad = limite === undefined ? 20 : Number(limite);
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 50)
      throw new BadRequestException('El limite debe ser un entero entre 1 y 50');
    return this.bakery.listarMovimientosArticulo(id, cantidad);
  }

  @Get('ventas')
  @Roles('ADMIN', 'CAJERO')
  listarVentas(@Query('turnoId') turnoId?: string) {
    return this.bakery.listarVentas(turnoId ? Number(turnoId) : undefined);
  }

  @Post('ventas')
  @Roles('ADMIN_LOCAL', 'CAJERO')
  crearVenta(@Req() req: AuthenticatedRequest, @Body() dto: CrearVentaPanaderiaDto) {
    return this.bakery.crearVenta(req.user.id, dto);
  }

  @Get('conteo')
  estadoConteo(@Query('date') fecha?: string) {
    if (!fecha) return this.bakery.estadoConteo();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new BadRequestException('La fecha debe tener formato AAAA-MM-DD');
    }
    const dia = new Date(`${fecha}T00:00:00.000Z`);
    if (Number.isNaN(dia.getTime()) || dia.toISOString().slice(0, 10) !== fecha) {
      throw new BadRequestException('La fecha no es valida');
    }
    return this.bakery.estadoConteo(dia);
  }

  @Get('conteo/lista')
  listarElementosConteo() { return this.bakery.listarElementosConteo(); }

  @Roles('ADMIN')
  @Post('conteo/lista')
  agregarElementoConteo(@Body() dto: AgregarElementoConteoPanaderiaDto) {
    return this.bakery.agregarElementoConteo(dto.articuloId);
  }

  @Roles('ADMIN')
  @Delete('conteo/lista/:id')
  retirarElementoConteo(@Param('id', ParseIntPipe) id: number) {
    return this.bakery.retirarElementoConteo(id);
  }

  @Post('conteo/:id')
  registrarConteo(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
    @Body() dto: RegistrarConteoPanaderiaDto,
  ) { return this.bakery.registrarConteo(id, req.user.id, dto); }

  @Get('cajas')
  @Roles('ADMIN', 'CAJERO')
  listarCajas() { return this.bakery.listarCajas(); }

  @Roles('ADMIN')
  @Post('cajas')
  crearCaja(@Body() dto: CreateCajaDto) { return this.bakery.crearCaja(dto.nombre); }

  @Get('transferencias')
  @Roles('ADMIN', 'CAJERO')
  @Area('AMBAS')
  listarTransferencias() { return this.bakery.listarTransferencias(); }

  @Roles('ADMIN')
  @Post('transferencias')
  crearTransferencia(@Req() req: AuthenticatedRequest, @Body() dto: CrearTransferenciaPanaderiaDto) {
    return this.bakery.crearTransferencia(req.user.id, dto);
  }

  @Post('transferencias/:id/recibir')
  @Roles('ADMIN_LOCAL', 'CAJERO')
  @Area('RESTAURANTE')
  recibirTransferencia(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest) {
    return this.bakery.recibirTransferencia(id, req.user.id);
  }

  @Post('transferencias/:id/confirmar-ingreso')
  @Roles('ADMIN_LOCAL', 'CAJERO')
  confirmarIngresoTransferencia(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
    @Body() dto: ConfirmarIngresoTransferenciaDto,
  ) { return this.bakery.confirmarIngresoTransferencia(id, req.user.id, dto); }
}
