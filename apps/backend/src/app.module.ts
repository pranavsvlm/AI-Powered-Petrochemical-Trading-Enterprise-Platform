import { MiddlewareConsumer, Module, NestModule, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { TenantContextMiddleware } from './common/tenant/tenant-context.middleware';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { DeprecationInterceptor } from './common/interceptors/deprecation.interceptor';
import { IdempotencyInterceptor } from './common/interceptors/idempotency.interceptor';
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
import { ExtensibilityModule } from './modules/extensibility/extensibility.module';
import { DeveloperModule } from './modules/developer/developer.module';

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
    ExtensibilityModule,
    DeveloperModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: RateLimitGuard },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: DeprecationInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
