import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TicketBuilderService } from './ticket-builder.service';
import { ImpresionService } from './impresion.service';
import { ImpresorasService } from './impresoras.service';
import { ImpresorasController } from './impresoras.controller';
import { ImpresionesController, ImpresionFacturasController } from './impresiones.controller';
import { AgenteImpresionController } from './agente-impresion.controller';
import { AgenteImpresionService } from './agente-impresion.service';

@Module({
  imports: [PrismaModule],
  controllers: [ImpresorasController, ImpresionesController, ImpresionFacturasController, AgenteImpresionController],
  providers: [TicketBuilderService, ImpresionService, ImpresorasService, AgenteImpresionService],
  exports: [ImpresionService],
})
export class PrintingModule {}
