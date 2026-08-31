import { Controller, Get, Post, Body } from '@nestjs/common';
import { BillingConfigService } from './billing-config.service';
import { UpdateConfigDto } from './dto/update-config.dto';
import { Roles } from '../auth/decorators/roles.decorator';

@Roles('ADMIN', 'CAJERO')
@Controller('/billing/config')
export class BillingConfigController {
  constructor(private readonly billingConfigService: BillingConfigService) {}

  @Get()
  findActiva() {
    return this.billingConfigService.findActiva();
  }

  @Roles('ADMIN')
  @Get('historial')
  findHistorial() {
    return this.billingConfigService.findHistorial();
  }

  @Roles('ADMIN')
  @Post()
  crearVersion(@Body() updateConfigDto: UpdateConfigDto) {
    return this.billingConfigService.crearVersion(updateConfigDto);
  }
}
