import { Module } from '@nestjs/common';
import { ZonesController } from './zones.controller';
import { ZonesService } from './zones.service';
import { TablesController } from './tables.controller';
import { TablesService } from './tables.service';

@Module({
  controllers: [ZonesController, TablesController],
  providers: [ZonesService, TablesService],
})
export class SalonModule {}
