export { InventoryService } from '../application/inventory.service';
export type {
  InventoryAuditWriter,
  InventoryEventPublisher,
  WarehouseLookupPort,
  InventoryReservePort,
  InventoryReleasePort,
  InventoryCommitPort,
  InventoryReceiptPort,
  ReserveLineInput,
  RecordReceiptInput,
} from '../application/inventory.service';
export { InsufficientStockException } from '../application/insufficient-stock.exception';
export { InventoryRepository } from '../infrastructure/inventory.repository';
export * from '../domain/inventory-math';
export * from '../domain/reservation-lifecycle';
