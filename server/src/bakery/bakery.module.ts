import { Module } from '@nestjs/common';
import { BakeryController } from './bakery.controller';
import { TransferenciasRestauranteController } from './transferencias-restaurante.controller';
import { BakeryService } from './bakery.service';

@Module({
  controllers: [BakeryController, TransferenciasRestauranteController],
  providers: [BakeryService],
  exports: [BakeryService],
})
export class BakeryModule {}
