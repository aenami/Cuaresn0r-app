import { Module } from '@nestjs/common';
import { RecipesService } from './recipes.service';
import { RecipesController } from './recipes.controller';
import { IngredientsController } from './ingredients.controller';
import { IngredientsService } from './ingredients.service';
import { InventoryService } from './inventory.service';
import { ProductionPlansController } from './production-plans.controller';
import { ProductionPlansService } from './production-plans.service';

@Module({
  // IngredientsController primero: Nest/Express matchea rutas en orden de
  // registro, y "/recipes/:id" (RecipesController) capturaria
  // "/recipes/ingredients" como si "ingredients" fuera el :id si fuera antes.
  controllers: [IngredientsController, ProductionPlansController, RecipesController],
  providers: [RecipesService, IngredientsService, InventoryService, ProductionPlansService],
  // InventoryService lo reutiliza Orders para descontar/revertir stock
  // dentro de sus propias transacciones al enviar/cancelar comandas.
  exports: [InventoryService],
})
export class RecipesModule {}
