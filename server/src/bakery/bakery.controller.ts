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
  CrearVentaPanaderiaDto,
  EntradaPanaderiaDto,
  AgregarElementoConteoPanaderiaDto,
  RegistrarConteoPanaderiaDto,
} from './dto';

@Roles('ADMIN', 'CAJERO', 'PANADERO')
@Area('PANADERIA')
@Controller('/bakery')
export class BakeryController {
  constructor(private readonly bakery: BakeryService) {}

  @Get('articulos')
  listarArticulos() {
    return this.bakery.listarArticulos();
  }

  @Get('recetas')
  listarRecetas() {
    return this.bakery.listarRecetas();
  }

  @Roles('ADMIN_LOCAL')
  @Post('recetas')
  crearReceta(@Body() dto: CrearRecetaPanaderiaDto) {
    return this.bakery.crearReceta(dto);
  }

  @Roles('ADMIN_LOCAL')
  @Patch('recetas/:id/desactivar')
  desactivarReceta(@Param('id', ParseIntPipe) id: number) {
    return this.bakery.desactivarReceta(id);
  }

  @Roles('ADMIN')
  @Post('articulos')
  crearArticulo(@Body() dto: CrearArticuloPanaderiaDto) {
    return this.bakery.crearArticulo(dto);
  }

  @Roles('ADMIN')
  @Patch('articulos/:id')
  actualizarArticulo(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarArticuloPanaderiaDto,
  ) {
    return this.bakery.actualizarArticulo(id, dto);
  }

  @Post('articulos/:id/entradas')
  registrarEntrada(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
    @Body() dto: EntradaPanaderiaDto,
  ) {
    return this.bakery.registrarEntrada(id, req.user.id, dto);
  }

  @Post('articulos/:id/mermas')
  registrarMerma(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
    @Body() dto: EntradaPanaderiaDto,
  ) {
    return this.bakery.registrarMerma(id, req.user.id, dto);
  }

  @Roles('CAJERO', 'ADMIN_LOCAL')
  @Post('articulos/:id/hornadas-caja')
  recibirHornada(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
    @Body() dto: EntradaPanaderiaDto,
  ) {
    return this.bakery.registrarHornadaCaja(id, req.user.id, dto);
  }

  @Post('articulos/:id/salidas')
  registrarSalidaManual(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
    @Body() dto: EntradaPanaderiaDto,
  ) {
    return this.bakery.registrarSalidaManual(id, req.user.id, dto);
  }

  @Get('articulos/:id/movimientos')
  listarMovimientosArticulo(
    @Param('id', ParseIntPipe) id: number,
    @Query('limit') limite?: string,
  ) {
    const cantidad = limite === undefined ? 20 : Number(limite);
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 50)
      throw new BadRequestException(
        'El limite debe ser un entero entre 1 y 50',
      );
    return this.bakery.listarMovimientosArticulo(id, cantidad);
  }

  @Get('ventas')
  @Roles('ADMIN', 'CAJERO')
  listarVentas(
    @Query('turnoId') turnoId?: string,
    @Query('date') fecha?: string,
  ) {
    if (
      turnoId !== undefined &&
      (!/^\d+$/.test(turnoId) ||
        !Number.isSafeInteger(Number(turnoId)) ||
        Number(turnoId) < 1)
    )
      throw new BadRequestException('El turno debe ser un entero positivo');
    if (fecha !== undefined) {
      const dia = new Date(`${fecha}T00:00:00.000Z`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(fecha) ||
        Number.isNaN(dia.getTime()) ||
        dia.toISOString().slice(0, 10) !== fecha
      )
        throw new BadRequestException(
          'La fecha debe ser válida y tener formato AAAA-MM-DD',
        );
    }
    return this.bakery.listarVentas(
      turnoId ? Number(turnoId) : undefined,
      fecha,
    );
  }

  @Post('ventas')
  @Roles('ADMIN_LOCAL', 'CAJERO')
  crearVenta(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CrearVentaPanaderiaDto,
  ) {
    return this.bakery.crearVenta(req.user.id, dto);
  }

  @Get('conteo')
  estadoConteo(@Query('date') fecha?: string) {
    if (!fecha) return this.bakery.estadoConteo();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new BadRequestException('La fecha debe tener formato AAAA-MM-DD');
    }
    const dia = new Date(`${fecha}T00:00:00.000Z`);
    if (
      Number.isNaN(dia.getTime()) ||
      dia.toISOString().slice(0, 10) !== fecha
    ) {
      throw new BadRequestException('La fecha no es valida');
    }
    return this.bakery.estadoConteo(dia);
  }

  @Get('conteo/lista')
  listarElementosConteo() {
    return this.bakery.listarElementosConteo();
  }

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
  ) {
    return this.bakery.registrarConteo(id, req.user.id, dto);
  }
}
