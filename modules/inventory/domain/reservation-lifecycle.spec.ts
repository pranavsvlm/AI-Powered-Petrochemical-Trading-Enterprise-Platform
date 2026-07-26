import { assertReservationTransition, canTransitionReservation } from './reservation-lifecycle';

describe('reservation-lifecycle', () => {
  it('allows ACTIVE -> RELEASED', () => {
    expect(canTransitionReservation('ACTIVE', 'RELEASED')).toBe(true);
  });

  it('allows ACTIVE -> COMMITTED', () => {
    expect(canTransitionReservation('ACTIVE', 'COMMITTED')).toBe(true);
  });

  it('rejects re-transitioning a RELEASED reservation', () => {
    expect(canTransitionReservation('RELEASED', 'COMMITTED')).toBe(false);
  });

  it('rejects re-transitioning a COMMITTED reservation', () => {
    expect(canTransitionReservation('COMMITTED', 'RELEASED')).toBe(false);
  });

  it('throws with a descriptive message on an illegal transition', () => {
    expect(() => assertReservationTransition('COMMITTED', 'ACTIVE')).toThrow(
      'Cannot transition stock reservation from COMMITTED to ACTIVE.',
    );
  });
});
