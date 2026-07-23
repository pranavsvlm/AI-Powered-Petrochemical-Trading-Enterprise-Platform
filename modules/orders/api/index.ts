export { OrderService } from '../application/order.service';
export type {
  OrderAuditWriter,
  OrderEventPublisher,
  ApprovalEvaluator,
  QuotationLookupPort,
  CustomerLookupPort,
  ProductLookupPort,
  CreateOrderDirectInput,
} from '../application/order.service';
export { OrderRepository } from '../infrastructure/order.repository';
export type { CreateOrderInput, OrderLineItemInput } from '../infrastructure/order.repository';
export {
  canTransitionOrder,
  assertOrderTransition,
  computeAggregateFulfillmentStatus,
} from '../domain/order-lifecycle';
export type { OrderStatus } from '../domain/order-lifecycle';
