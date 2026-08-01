export class InvalidTimeEntryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTimeEntryError';
  }
}

/** Rounds down to the nearest whole minute — never rounds up (never overcharges tracked time). */
export function computeDurationMinutes(startedAt: Date, endedAt: Date): number {
  if (endedAt.getTime() < startedAt.getTime()) {
    throw new InvalidTimeEntryError('endedAt cannot be before startedAt.');
  }
  return Math.floor((endedAt.getTime() - startedAt.getTime()) / 60_000);
}
