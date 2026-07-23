import {
  assertOrderTransition,
  canTransitionOrder,
  computeAggregateFulfillmentStatus,
} from './order-lifecycle';

describe('canTransitionOrder', () => {
  it('allows the pending -> confirmed -> fulfilled -> closed happy path', () => {
    expect(canTransitionOrder('PENDING_CONFIRMATION', 'CONFIRMED')).toBe(true);
    expect(canTransitionOrder('CONFIRMED', 'FULFILLED')).toBe(true);
    expect(canTransitionOrder('FULFILLED', 'CLOSED')).toBe(true);
  });

  it('allows partial fulfillment before full fulfillment', () => {
    expect(canTransitionOrder('CONFIRMED', 'PARTIALLY_FULFILLED')).toBe(true);
    expect(canTransitionOrder('PARTIALLY_FULFILLED', 'FULFILLED')).toBe(true);
  });

  it('allows holding and releasing a confirmed order', () => {
    expect(canTransitionOrder('CONFIRMED', 'ON_HOLD')).toBe(true);
    expect(canTransitionOrder('ON_HOLD', 'CONFIRMED')).toBe(true);
  });

  it('rejects fulfilling an order that was never confirmed', () => {
    expect(canTransitionOrder('PENDING_CONFIRMATION', 'FULFILLED')).toBe(false);
  });

  it('rejects transitions out of terminal states', () => {
    expect(canTransitionOrder('CLOSED', 'CONFIRMED')).toBe(false);
    expect(canTransitionOrder('CANCELLED', 'CONFIRMED')).toBe(false);
  });
});

describe('assertOrderTransition', () => {
  it('throws for a disallowed transition', () => {
    expect(() => assertOrderTransition('CLOSED', 'CANCELLED')).toThrow();
  });
});

describe('computeAggregateFulfillmentStatus', () => {
  it('returns CONFIRMED when nothing has been fulfilled yet', () => {
    const status = computeAggregateFulfillmentStatus([{ quantity: 10, fulfilledQuantity: 0 }]);
    expect(status).toBe('CONFIRMED');
  });

  it('returns PARTIALLY_FULFILLED when some but not all lines are fulfilled', () => {
    const status = computeAggregateFulfillmentStatus([
      { quantity: 10, fulfilledQuantity: 5 },
      { quantity: 10, fulfilledQuantity: 0 },
    ]);
    expect(status).toBe('PARTIALLY_FULFILLED');
  });

  it('returns FULFILLED when every line is fully fulfilled', () => {
    const status = computeAggregateFulfillmentStatus([
      { quantity: 10, fulfilledQuantity: 10 },
      { quantity: 5, fulfilledQuantity: 5 },
    ]);
    expect(status).toBe('FULFILLED');
  });

  it('treats an order with no line items as CONFIRMED', () => {
    expect(computeAggregateFulfillmentStatus([])).toBe('CONFIRMED');
  });
});
