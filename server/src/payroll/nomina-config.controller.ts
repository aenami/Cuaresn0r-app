import { Controller, Get, Post, Body } from '@nestjs/common';
import { NominaConfigService } from './nomina-config.service';
import { UpdateNominaConfigDto } from './dto/update-nomina-config.dto';
import { Roles } from '../auth/decorators/roles.decorator';

@Roles('ADMIN')
@Controller('/payroll/config')
export class NominaConfigController {
  constructor(private readonly nominaConfigService: NominaConfigService) {}

  @Get()
  findActiva() {
    return this.nominaConfigService.findActiva();
  }

  @Get('historial')
  findHistorial() {
    return this.nominaConfigService.findHistorial();
  }

  @Post()
  crearVersion(@Body() updateNominaConfigDto: UpdateNominaConfigDto) {
    return this.nominaConfigService.crearVersion(updateNominaConfigDto);
  }
}
