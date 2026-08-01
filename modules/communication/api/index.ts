export { CommsService } from '../application/comms.service';
export type {
  CommsAuditWriter,
  CommsEventPublisher,
  CommsNotificationPort,
  CustomerActivityPort,
} from '../application/comms.service';

export { CommsThreadRepository } from '../infrastructure/comms-thread.repository';
export type {
  CreateThreadInput,
  AddParticipantInput,
  AddMessageInput,
  ThreadWithChildren,
} from '../infrastructure/comms-thread.repository';

export { isRealChannel } from '../domain/comms-channel';
