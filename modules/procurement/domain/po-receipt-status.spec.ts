import { computeAggregateReceiptStatus } from './po-receipt-status';

describe('computeAggregateReceiptStatus', () => {
  it('returns SENT when nothing has been received', () => {
    expect(computeAggregateReceiptStatus([{ quantity: 10, receivedQuantity: 0 }])).toBe('SENT');
  });

  it('returns PARTIALLY_RECEIVED when some but not all lines are fully received', () => {
    expect(
      computeAggregateReceiptStatus([
        { quantity: 10, receivedQuantity: 10 },
        { quantity: 10, receivedQuantity: 4 },
      ]),
    ).toBe('PARTIALLY_RECEIVED');
  });

  it('returns RECEIVED when all lines are fully received', () => {
    expect(
      computeAggregateReceiptStatus([
        { quantity: 10, receivedQuantity: 10 },
        { quantity: 5, receivedQuantity: 5 },
      ]),
    ).toBe('RECEIVED');
  });

  it('caps over-receipt at the line quantity rather than overshooting', () => {
    expect(computeAggregateReceiptStatus([{ quantity: 10, receivedQuantity: 15 }])).toBe(
      'RECEIVED',
    );
  });

  it('treats an empty PO as SENT', () => {
    expect(computeAggregateReceiptStatus([])).toBe('SENT');
  });
});
