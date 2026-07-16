export const PACKAGE_NAME = '@platform/notifications';

export type { EmailMessage, EmailSenderPort } from './domain/ports/email-sender.port';
export { EMAIL_SENDER_PORT } from './domain/ports/email-sender.port';
export type { ChannelAdapter, ChannelSendInput } from './domain/ports/channel-adapter.port';
export type { AiNotificationAssistant } from './domain/ports/ai-notification-assistant.port';
export { NotImplementedAiNotificationAssistant } from './domain/ports/ai-notification-assistant.port';
export { ChannelNotAvailableError } from './domain/errors';

export { TemplateRenderer } from './application/template-renderer';
export { NotificationService } from './application/notification.service';
export type { SendNotificationInput } from './application/notification.service';
export { NotificationPreferenceService } from './application/notification-preference.service';
export type { UpsertPreferenceInput } from './application/notification-preference.service';
export { EscalationCheckerService } from './application/escalation-checker.service';

export { ConsoleEmailSenderAdapter } from './infrastructure/console-email-sender.adapter';
export { SmtpEmailSenderAdapter } from './infrastructure/smtp-email-sender.adapter';
export {
  ChannelAdapterRegistry,
  EmailChannelAdapter,
  InAppChannelAdapter,
  UnavailableChannelAdapter,
} from './infrastructure/channel-adapters';
export { registerWorkflowApprovalRequestedSubscriber } from './infrastructure/workflow-approval-requested.subscriber';
