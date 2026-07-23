import { isWithinCreditLimit } from './credit';

describe('isWithinCreditLimit', () => {
  it('treats an unset credit limit as unrestricted', () => {
    expect(
      isWithinCreditLimit({
        creditLimit: null,
        outstandingBalance: 1_000_000,
        proposedOrderTotal: 1,
      }),
    ).toBe(true);
  });

  it('allows an order that stays within the limit', () => {
    expect(
      isWithinCreditLimit({
        creditLimit: 10_000,
        outstandingBalance: 4_000,
        proposedOrderTotal: 5_000,
      }),
    ).toBe(true);
  });

  it('rejects an order that would exceed the limit', () => {
    expect(
      isWithinCreditLimit({
        creditLimit: 10_000,
        outstandingBalance: 8_000,
        proposedOrderTotal: 5_000,
      }),
    ).toBe(false);
  });
});
