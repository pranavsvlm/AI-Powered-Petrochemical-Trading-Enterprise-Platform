import type { TaskStatus } from '@platform/database';

/**
 * Kanban-column order (doc 25). Not a strict linear workflow — any status may move to
 * ARCHIVED (archiving is how this platform "deletes" without a real DELETE, same convention
 * as every other module), and COMPLETED may move back to IN_PROGRESS (reopening a task) or
 * REVIEW (reviewer sends it back). Everything else follows the board's left-to-right order.
 */
const FORWARD_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  BACKLOG: ['PLANNED', 'ARCHIVED'],
  PLANNED: ['IN_PROGRESS', 'BACKLOG', 'ARCHIVED'],
  IN_PROGRESS: ['REVIEW', 'PLANNED', 'ARCHIVED'],
  REVIEW: ['COMPLETED', 'IN_PROGRESS', 'ARCHIVED'],
  COMPLETED: ['IN_PROGRESS', 'REVIEW', 'ARCHIVED'],
  ARCHIVED: [],
};

export function isValidStatusTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return false;
  return FORWARD_TRANSITIONS[from].includes(to);
}

export function isOverdue(
  dueDate: Date | null,
  status: TaskStatus,
  now: Date = new Date(),
): boolean {
  if (!dueDate) return false;
  if (status === 'COMPLETED' || status === 'ARCHIVED') return false;
  return dueDate.getTime() < now.getTime();
}
