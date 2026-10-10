import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { CombosController } from './combos.controller';
import { CombosService } from './combos.service';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { MenuDiarioController } from './menu-diario.controller';

@Module({
  controllers: [
    CategoriesController,
    ProductsController,
    CombosController,
    UploadsController,
    MenuDiarioController,
  ],
  providers: [
    CategoriesService,
    ProductsService,
    CombosService,
    UploadsService,
  ],
})
export class CatalogModule {}
