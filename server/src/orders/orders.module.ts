import { Module } from '@nestjs/common';
import { RecipesModule } from '../recipes/recipes.module';
import { PrintingModule } from '../printing/printing.module';
import { PedidosController } from './pedidos.controller';
import { PedidosService } from './pedidos.service';
import { ComandasController } from './comandas.controller';
import { ComandasService } from './comandas.service';
import { ItemsController } from './items.controller';
import { ItemsService } from './items.service';
import { SubcuentasController } from './subcuentas.controller';
import { SubcuentasService } from './subcuentas.service';

@Module({
  imports: [RecipesModule, PrintingModule],
  controllers: [PedidosController, ComandasController, ItemsController, SubcuentasController],
  providers: [PedidosService, ComandasService, ItemsService, SubcuentasService],
})
export class OrdersModule {}
