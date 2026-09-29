import { Module } from '@nestjs/common';
import { BakeryController } from './bakery.controller';
import { TransferenciasRestauranteController } from './transferencias-restaurante.controller';
import { BakeryService } from './bakery.service';
import { RemisionesService } from './remisiones.service';
import { RemisionesController } from './remisiones.controller';

@Module({
  controllers: [BakeryController, TransferenciasRestauranteController, RemisionesController],
  providers: [BakeryService, RemisionesService],
  exports: [BakeryService],
})
export class BakeryModule {}
