import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe, Req } from '@nestjs/common';
import { IngredientsService } from './ingredients.service';
import { InventoryService } from './inventory.service';
import { CreateIngredientDto } from './dto/create-ingredient.dto';
import { UpdateIngredientDto } from './dto/update-ingredient.dto';
import { CreateMovementDto } from './dto/create-movement.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';

@Controller('/recipes/ingredients')
export class IngredientsController {
  constructor(
    private readonly ingredientsService: IngredientsService,
    private readonly inventoryService: InventoryService,
  ) {}

  @Roles('ADMIN')
  @Post()
  create(@Body() createIngredientDto: CreateIngredientDto) {
    return this.ingredientsService.create(createIngredientDto);
  }

  @Get()
  findAll() {
    return this.ingredientsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.ingredientsService.findOne(id);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() updateIngredientDto: UpdateIngredientDto) {
    return this.ingredientsService.update(id, updateIngredientDto);
  }

  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.ingredientsService.remove(id);
  }

  @Get(':id/movements')
  findMovements(@Param('id', ParseIntPipe) id: number) {
    return this.inventoryService.findMovimientos(id);
  }

  // ENTRADA/MERMA/AJUSTE_*: SALIDA_RECETA y REVERSO solo los genera Orders.
  @Roles('ADMIN')
  @Post(':id/movements')
  registerMovement(
    @Param('id', ParseIntPipe) id: number,
    @Body() createMovementDto: CreateMovementDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.registrarMovimientoManual(id, createMovementDto, req.user.id);
  }
}
