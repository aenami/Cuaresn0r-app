import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { Area } from '../auth/decorators/area.decorator';
import { InventoryValuationService } from './inventory-valuation.service';

@Roles('ADMIN')
@Area('AMBAS')
@Controller('/recipes/inventory-valuation')
export class InventoryValuationController {
  constructor(private readonly valuation: InventoryValuationService) {}

  @Get('monthly')
  monthly(@Query('month') mes?: string) {
    return this.valuation.monthly(mes);
  }
}
