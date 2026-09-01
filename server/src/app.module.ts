import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { OrdersModule } from './orders/orders.module';
import { AuthModule } from './auth/auth.module';
import { RecipesModule } from './recipes/recipes.module';
import { CatalogModule } from './catalog/catalog.module';
import { SalonModule } from './salon/salon.module';
import { BillingModule } from './billing/billing.module';
import { PayrollModule } from './payroll/payroll.module';
import { PrintingModule } from './printing/printing.module';
import { ReportsModule } from './reports/reports.module';
import { HealthController } from './health.controller';
import { FichasModule } from './fichas/fichas.module';

@Module({
  imports: [
    PrismaModule,
    OrdersModule,
    AuthModule,
    RecipesModule,
    CatalogModule,
    SalonModule,
    FichasModule,
    BillingModule,
    PayrollModule,
    PrintingModule,
    ReportsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
