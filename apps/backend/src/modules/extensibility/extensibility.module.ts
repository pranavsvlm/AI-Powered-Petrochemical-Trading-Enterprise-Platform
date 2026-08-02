import { Module } from '@nestjs/common';
import { ApiKeyService, PluginService, WebhookService } from '@modules/extensibility';
import { ApiKeysController } from './api-keys.controller';
import { PluginsController } from './plugins.controller';
import { WebhooksController } from './webhooks.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';

@Module({
  controllers: [ApiKeysController, PluginsController, WebhooksController],
  providers: [
    AuditService,
    {
      provide: ApiKeyService,
      useFactory: (prisma: PrismaService, audit: AuditService) =>
        new ApiKeyService(prisma.client, audit),
      inject: [PrismaService, AuditService],
    },
    {
      provide: PluginService,
      useFactory: (prisma: PrismaService, audit: AuditService) =>
        new PluginService(prisma.client, audit),
      inject: [PrismaService, AuditService],
    },
    {
      provide: WebhookService,
      useFactory: (prisma: PrismaService, plugins: PluginService, audit: AuditService) =>
        new WebhookService(prisma.client, plugins, audit),
      inject: [PrismaService, PluginService, AuditService],
    },
  ],
  exports: [ApiKeyService, PluginService, WebhookService],
})
export class ExtensibilityModule {}
