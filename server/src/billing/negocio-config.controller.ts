import { Body, Controller, Get, Post } from '@nestjs/common';
import { NegocioConfigService } from './negocio-config.service';
import { UpdateNegocioDto } from './dto/update-negocio.dto';
import { Roles } from '../auth/decorators/roles.decorator';

// GET lo usan cajero y admin (encabezado de la factura en la vista previa);
// editar los datos del negocio es solo ADMIN.
@Roles('ADMIN', 'CAJERO')
@Controller('/billing/negocio')
export class NegocioConfigController {
  constructor(private readonly negocioConfigService: NegocioConfigService) {}

  @Get()
  findActiva() {
    return this.negocioConfigService.findActiva();
  }

  @Roles('ADMIN')
  @Post()
  crear(@Body() dto: UpdateNegocioDto) {
    return this.negocioConfigService.crearVersion(dto);
  }
}
