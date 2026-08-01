import { Module } from '@nestjs/common';
import {
  CommsService,
  type CommsNotificationPort,
  type CustomerActivityPort,
} from '@modules/communication';
import { CustomerService } from '@modules/customers';
import { RedisStreamsEventBus } from '@platform/event-bus';
import {
  ChannelAdapterRegistry,
  ConsoleEmailSenderAdapter,
  NotificationService,
  SmtpEmailSenderAdapter,
  type EmailSenderPort,
} from '@platform/notifications';
import { CommsController } from './comms.controller';
import { CustomersModule } from '../customers/customers.module';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';

@Module({
  imports: [CustomersModule],
  controllers: [CommsController],
  providers: [
    AuditService,
    {
      provide: CommsService,
      useFactory: (
        prisma: PrismaService,
        audit: AuditService,
        customerService: CustomerService,
      ) => {
        const db = prisma.client;
        const eventBus = new RedisStreamsEventBus();

        const emailAdapter: EmailSenderPort =
          process.env.NOTIFICATIONS_EMAIL_ADAPTER === 'smtp'
            ? new SmtpEmailSenderAdapter()
            : new ConsoleEmailSenderAdapter();

        // Same real NotificationService the Notification Center controller constructs — best-
        // effort "someone got a new message" pings, never blocks a send. See comms.service.ts.
        const registry = new ChannelAdapterRegistry(emailAdapter);
        const notificationService = new NotificationService(registry, prisma.client);
        const notifications: CommsNotificationPort = {
          notify: (input) =>
            notificationService
              .send({
                companyId: input.companyId,
                recipientUserId: input.recipientUserId,
                title: input.title,
                body: input.body,
                category: input.category,
                channels: ['IN_APP'],
              })
              .then((notification) => ({ notificationId: notification.id })),
        };

        // Calls CustomerService's own published addActivity — never queries customers' tables
        // directly. See modules/quotations' CustomerLookupPort for the same pattern.
        const customerActivity: CustomerActivityPort = {
          record: (customerId, type, body, authorUserId) =>
            customerService.addActivity(customerId, type, body, authorUserId).then(() => undefined),
        };

        return new CommsService(db, audit, eventBus, emailAdapter, notifications, customerActivity);
      },
      inject: [PrismaService, AuditService, CustomerService],
    },
  ],
  exports: [CommsService],
})
export class CommsModule {}
