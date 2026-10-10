import { Module } from '@nestjs/common';
import { BakeryController } from './bakery.controller';
import { BakeryService } from './bakery.service';
import { RemisionesService } from './remisiones.service';
import { RemisionesController } from './remisiones.controller';
import { CategoriasPanaderiaController } from './categorias-panaderia.controller';
import { CategoriasPanaderiaService } from './categorias-panaderia.service';
import {
  ProductionGoalsBakeryController,
  ProductionSheetsController,
} from './production.controller';
import {
  ProductionGoalsBakeryService,
  ProductionSheetsService,
} from './production.service';

@Module({
  controllers: [
    BakeryController,
    RemisionesController,
    CategoriasPanaderiaController,
    ProductionSheetsController,
    ProductionGoalsBakeryController,
  ],
  providers: [
    BakeryService,
    RemisionesService,
    CategoriasPanaderiaService,
    ProductionSheetsService,
    ProductionGoalsBakeryService,
  ],
  exports: [BakeryService],
})
export class BakeryModule {}
