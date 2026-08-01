import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { TenantContextMiddleware } from './common/tenant/tenant-context.middleware';
import { AuthModule } from './modules/auth/auth.module';
import { CompanyModule } from './modules/company/company.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { EventsModule } from './modules/events/events.module';
import { RulesModule } from './modules/rules/rules.module';
import { WorkflowsModule } from './modules/workflows/workflows.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { CustomersModule } from './modules/customers/customers.module';
import { ProductsModule } from './modules/products/products.module';
import { QuotationsModule } from './modules/quotations/quotations.module';
import { OrdersModule } from './modules/orders/orders.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ProcurementModule } from './modules/procurement/procurement.module';
import { AccountingModule } from './modules/accounting/accounting.module';
import { AiModule } from './modules/ai/ai.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { CommsModule } from './modules/comms/comms.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { HrModule } from './modules/hr/hr.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    CompanyModule,
    UsersModule,
    RolesModule,
    EventsModule,
    RulesModule,
    WorkflowsModule,
    NotificationsModule,
    DocumentsModule,
    CustomersModule,
    ProductsModule,
    QuotationsModule,
    OrdersModule,
    InventoryModule,
    ProcurementModule,
    AccountingModule,
    AiModule,
    TasksModule,
    CommsModule,
    AnalyticsModule,
    HrModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
