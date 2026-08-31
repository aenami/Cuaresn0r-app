import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TicketBuilderService } from './ticket-builder.service';
import { ImpresionService } from './impresion.service';
import { ImpresorasService } from './impresoras.service';
import { ImpresorasController } from './impresoras.controller';
import { ImpresionesController, ImpresionFacturasController } from './impresiones.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ImpresorasController, ImpresionesController, ImpresionFacturasController],
  providers: [TicketBuilderService, ImpresionService, ImpresorasService],
  exports: [ImpresionService],
})
export class PrintingModule {}
