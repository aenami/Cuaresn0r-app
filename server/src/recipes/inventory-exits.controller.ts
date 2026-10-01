import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { CreateProductExitDto } from './dto/create-product-exit.dto';
import { InventoryExitsService } from './inventory-exits.service';

@Controller('/recipes/inventory-exits')
@Roles('ADMIN', 'CAJERO', 'COCINERO')
export class InventoryExitsController {
  constructor(private readonly exits: InventoryExitsService) {}

  @Get()
  listar(@Query('date') fecha?: string) {
    return this.exits.listar(fecha);
  }

  @Roles('ADMIN_LOCAL', 'CAJERO', 'COCINERO')
  @Post('products')
  registrarProducto(
    @Body() dto: CreateProductExitDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.exits.registrarProducto(dto, req.user.id);
  }
}
