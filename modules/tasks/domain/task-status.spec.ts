import { isValidStatusTransition, isOverdue } from './task-status';

describe('isValidStatusTransition', () => {
  it('allows forward movement through the board', () => {
    expect(isValidStatusTransition('BACKLOG', 'PLANNED')).toBe(true);
    expect(isValidStatusTransition('PLANNED', 'IN_PROGRESS')).toBe(true);
    expect(isValidStatusTransition('IN_PROGRESS', 'REVIEW')).toBe(true);
    expect(isValidStatusTransition('REVIEW', 'COMPLETED')).toBe(true);
  });

  it('allows a reviewer to send work back a step', () => {
    expect(isValidStatusTransition('REVIEW', 'IN_PROGRESS')).toBe(true);
  });

  it('allows reopening a completed task', () => {
    expect(isValidStatusTransition('COMPLETED', 'IN_PROGRESS')).toBe(true);
    expect(isValidStatusTransition('COMPLETED', 'REVIEW')).toBe(true);
  });

  it('allows archiving from any non-terminal status', () => {
    expect(isValidStatusTransition('BACKLOG', 'ARCHIVED')).toBe(true);
    expect(isValidStatusTransition('COMPLETED', 'ARCHIVED')).toBe(true);
  });

  it('rejects skipping ahead in the board', () => {
    expect(isValidStatusTransition('BACKLOG', 'REVIEW')).toBe(false);
    expect(isValidStatusTransition('BACKLOG', 'COMPLETED')).toBe(false);
  });

  it('rejects a no-op transition', () => {
    expect(isValidStatusTransition('IN_PROGRESS', 'IN_PROGRESS')).toBe(false);
  });

  it('rejects any transition out of ARCHIVED — it is terminal', () => {
    expect(isValidStatusTransition('ARCHIVED', 'BACKLOG')).toBe(false);
  });
});

describe('isOverdue', () => {
  const now = new Date('2026-08-01T00:00:00Z');

  it('is false when there is no due date', () => {
    expect(isOverdue(null, 'IN_PROGRESS', now)).toBe(false);
  });

  it('is true for a past due date on an open task', () => {
    expect(isOverdue(new Date('2026-07-01T00:00:00Z'), 'IN_PROGRESS', now)).toBe(true);
  });

  it('is false for a future due date', () => {
    expect(isOverdue(new Date('2026-09-01T00:00:00Z'), 'IN_PROGRESS', now)).toBe(false);
  });

  it('is false once a task is completed, even past its due date', () => {
    expect(isOverdue(new Date('2026-07-01T00:00:00Z'), 'COMPLETED', now)).toBe(false);
  });

  it('is false once a task is archived, even past its due date', () => {
    expect(isOverdue(new Date('2026-07-01T00:00:00Z'), 'ARCHIVED', now)).toBe(false);
  });
});
