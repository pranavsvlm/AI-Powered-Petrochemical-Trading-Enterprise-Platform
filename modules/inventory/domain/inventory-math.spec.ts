import { availableQuantity, hasSufficientStock } from './inventory-math';

describe('inventory-math', () => {
  describe('availableQuantity', () => {
    it('subtracts reserved from on-hand', () => {
      expect(availableQuantity(100, 30)).toBe(70);
    });

    it('can go to exactly zero', () => {
      expect(availableQuantity(50, 50)).toBe(0);
    });
  });

  describe('hasSufficientStock', () => {
    it('is true when requested is within available', () => {
      expect(hasSufficientStock(100, 30, 70)).toBe(true);
    });

    it('is true at the exact boundary', () => {
      expect(hasSufficientStock(100, 30, 70.0)).toBe(true);
    });

    it('is false when requested exceeds available by any amount', () => {
      expect(hasSufficientStock(100, 30, 70.0001)).toBe(false);
    });

    it('is false when nothing is on hand', () => {
      expect(hasSufficientStock(0, 0, 1)).toBe(false);
    });
  });
});
