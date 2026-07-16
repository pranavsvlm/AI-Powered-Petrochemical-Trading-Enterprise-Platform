export class EventBusError extends Error {}

export class TenantMismatchError extends EventBusError {
  constructor(consumerCompanyId: string, eventCompanyId: string) {
    super(
      `Consumer is scoped to company ${consumerCompanyId} but received an event for company ${eventCompanyId}.`,
    );
    this.name = 'TenantMismatchError';
  }
}

export class EventNotFoundError extends EventBusError {
  constructor(eventId: string) {
    super(`Event ${eventId} not found.`);
    this.name = 'EventNotFoundError';
  }
}
