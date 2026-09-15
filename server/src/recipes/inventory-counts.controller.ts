import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { CreateInventoryCountDto } from './dto/create-inventory-count.dto';
import { FinalizeInventoryCountDto } from './dto/finalize-inventory-count.dto';
import { InventoryCountsService } from './inventory-counts.service';

@Controller('/recipes/inventory-counts')
export class InventoryCountsController {
  constructor(private readonly counts: InventoryCountsService) {}

  @Get()
  findAll(@Query('date') fecha?: string) {
    return this.counts.findAll(fecha);
  }

  @Post()
  create(
    @Body() dto: CreateInventoryCountDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.counts.create(dto, req.user.id);
  }

  @Patch(':id/finalize')
  finalize(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FinalizeInventoryCountDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.counts.finalize(id, dto.cantidadFisica, req.user.id);
  }

  @Roles('ADMIN')
  @Patch(':id/reopen')
  reopen(@Param('id', ParseIntPipe) id: number) {
    return this.counts.reopen(id);
  }

  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.counts.remove(id);
  }
}
