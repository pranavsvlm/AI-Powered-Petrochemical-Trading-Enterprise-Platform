/** docs/DOMAIN_MODEL_PHASE2.md §2 — selecting an unimplemented channel fails fast. */
export class ChannelNotAvailableError extends Error {
  constructor(channel: string) {
    super(`Notification channel "${channel}" is not yet available in this phase.`);
    this.name = 'ChannelNotAvailableError';
  }
}
