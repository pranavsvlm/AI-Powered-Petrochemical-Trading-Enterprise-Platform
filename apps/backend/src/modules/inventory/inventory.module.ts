import { Module } from '@nestjs/common';
import { InventoryService } from '@modules/inventory';
import { RedisStreamsEventBus } from '@platform/event-bus';
import { WarehousesController } from './warehouses.controller';
import { InventoryController } from './inventory.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';

@Module({
  controllers: [WarehousesController, InventoryController],
  providers: [
    AuditService,
    {
      provide: InventoryService,
      useFactory: (prisma: PrismaService, audit: AuditService) => {
        const db = prisma.client;
        const eventBus = new RedisStreamsEventBus();
        return new InventoryService(db, eventBus, audit);
      },
      inject: [PrismaService, AuditService],
    },
  ],
  exports: [InventoryService],
})
export class InventoryModule {}
