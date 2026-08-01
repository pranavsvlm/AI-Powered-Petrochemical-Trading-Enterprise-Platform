import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditEventType } from '@platform/core';
import type {
  TenantScopedPrismaClient,
  CommsThread,
  CommsParticipant,
  CommsMessage,
  ActivityType,
} from '@platform/database';
import { ChannelNotAvailableError, type EmailSenderPort } from '@platform/notifications';
import { EVENT_TYPES } from '@platform/event-bus';
import { isRealChannel } from '../domain/comms-channel';
import {
  CommsThreadRepository,
  type AddMessageInput,
  type AddParticipantInput,
  type CreateThreadInput,
  type ThreadWithChildren,
} from '../infrastructure/comms-thread.repository';

export interface CommsAuditWriter {
  record(entry: {
    companyId: string | null;
    actorUserId: string | null;
    eventType: AuditEventType;
    entityType: string;
    entityId: string | null;
    before?: unknown;
    after?: unknown;
    ipAddress?: string | null;
  }): Promise<void>;
}

export interface CommsEventPublisher {
  publish(
    topic: string,
    companyId: string,
    payload: unknown,
    source: string,
  ): Promise<{ eventId: string }>;
}

/** Same shape as `packages/rules-engine`'s own `NotificationClientPort` — best-effort, never blocks a send. */
export interface CommsNotificationPort {
  notify(input: {
    companyId: string;
    recipientUserId: string;
    title: string;
    body: string;
    category: string;
  }): Promise<{ notificationId: string }>;
}

/** Satisfied by `CustomerService.addActivity` at the NestJS composition root — the CRM-timeline integration. */
export interface CustomerActivityPort {
  record(customerId: string, type: ActivityType, body: string, authorUserId: string): Promise<void>;
}

/**
 * Application-layer use cases for the Communication aggregate (doc 19): threads, participants,
 * messages. Real channel dispatch only for EMAIL (via the platform's existing `EmailSenderPort`
 * — never reimplemented) and IN_APP (persisting the row is the delivery, same philosophy
 * `InAppChannelAdapter` already established); WHATSAPP/SMS/PUSH fail fast with the platform's
 * existing `ChannelNotAvailableError`, never a new error type — see
 * docs/DOMAIN_MODEL_PHASE7.md, Communication section.
 */
@Injectable()
export class CommsService {
  private readonly repo: CommsThreadRepository;

  constructor(
    private readonly db: TenantScopedPrismaClient,
    private readonly audit: CommsAuditWriter,
    private readonly events: CommsEventPublisher,
    private readonly emailSender: EmailSenderPort,
    private readonly notifications: CommsNotificationPort,
    private readonly customerActivity: CustomerActivityPort,
  ) {
    this.repo = new CommsThreadRepository(db);
  }

  async createThread(
    input: CreateThreadInput,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<CommsThread> {
    const thread = await this.repo.create({ ...input, createdByUserId: actorUserId });
    await this.audit.record({
      companyId: input.companyId,
      actorUserId,
      eventType: AuditEventType.COMMS_THREAD_CREATED,
      entityType: 'CommsThread',
      entityId: thread.id,
      after: { type: input.type, subjectType: input.subjectType, subjectId: input.subjectId },
      ipAddress: ipAddress ?? null,
    });
    return thread;
  }

  async getById(id: string): Promise<ThreadWithChildren> {
    const thread = await this.repo.findById(id);
    if (!thread) throw new NotFoundException('Thread not found.');
    return thread;
  }

  list(filters: Parameters<CommsThreadRepository['list']>[0]): Promise<CommsThread[]> {
    return this.repo.list(filters);
  }

  async close(id: string): Promise<CommsThread> {
    await this.getById(id);
    return this.repo.close(id);
  }

  async addParticipant(
    threadId: string,
    input: AddParticipantInput,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<CommsParticipant> {
    const thread = await this.getById(threadId);
    const participant = await this.repo.addParticipant(threadId, input);
    await this.audit.record({
      companyId: thread.companyId,
      actorUserId,
      eventType: AuditEventType.COMMS_PARTICIPANT_ADDED,
      entityType: 'CommsThread',
      entityId: threadId,
      after: input,
      ipAddress: ipAddress ?? null,
    });
    return participant;
  }

  /**
   * `input.direction === 'OUTBOUND'` is gated by `isRealChannel` — WHATSAPP/SMS/PUSH throw
   * `ChannelNotAvailableError` immediately, nothing persisted (fail fast). INBOUND messages
   * (recording one that already arrived via some channel) are never gated — see
   * `domain/comms-channel.ts`'s doc comment for why.
   */
  async sendMessage(
    threadId: string,
    input: AddMessageInput,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<CommsMessage> {
    const thread = await this.getById(threadId);

    if (input.direction === 'OUTBOUND') {
      if (!isRealChannel(input.channel)) {
        throw new ChannelNotAvailableError(input.channel);
      }
      if (input.channel === 'EMAIL') {
        const recipient = thread.participants.find(
          (p) => !p.userId && p.externalIdentifier?.includes('@'),
        );
        if (recipient?.externalIdentifier) {
          await this.emailSender.send({
            to: recipient.externalIdentifier,
            subject: thread.title ?? 'New message',
            body: input.content,
          });
        }
      }
    }

    const message = await this.repo.addMessage(threadId, input);
    await this.audit.record({
      companyId: thread.companyId,
      actorUserId,
      eventType: AuditEventType.COMMS_MESSAGE_SENT,
      entityType: 'CommsThread',
      entityId: threadId,
      after: { direction: input.direction, channel: input.channel },
      ipAddress: ipAddress ?? null,
    });

    // Best-effort: let internal participants (other than the sender) know. NotificationService
    // itself never throws for a channel it can't deliver on — it records the delivery failure
    // and moves on — so this never blocks the send.
    const internalRecipients = thread.participants.filter(
      (p) => p.userId && p.userId !== actorUserId,
    );
    for (const recipient of internalRecipients) {
      await this.notifications.notify({
        companyId: thread.companyId,
        recipientUserId: recipient.userId!,
        title: thread.title ?? 'New message',
        body: input.content.slice(0, 140),
        category: 'NEW_MESSAGE',
      });
    }

    if (thread.subjectType === 'Customer' && thread.subjectId) {
      await this.customerActivity.record(thread.subjectId, 'MESSAGE', input.content, actorUserId);
    }

    return message;
  }

  listMessages(threadId: string): Promise<CommsMessage[]> {
    return this.repo.listMessages(threadId);
  }

  /** Publishes the existing TaskGenerationRequested event — Phase 7a's already-running consumer picks it up. */
  async createTaskFromThread(
    threadId: string,
    input: { title: string; description?: string; assigneeUserId?: string },
    actorUserId: string,
  ): Promise<{ eventId: string }> {
    const thread = await this.getById(threadId);
    return this.events.publish(
      EVENT_TYPES.TASK_GENERATION_REQUESTED,
      thread.companyId,
      {
        // No real RuleExecution triggered this — a human clicked "create task" on a thread.
        // TaskGenerationRequestedPayload.ruleId is non-optional (every other publisher is a
        // real rule), so this is a documented placeholder, not a real rule reference.
        ruleId: `manual:${actorUserId}`,
        companyId: thread.companyId,
        assigneeUserId: input.assigneeUserId,
        title: input.title,
        description: input.description,
        sourceModule: 'communication',
        sourceEntityId: threadId,
      },
      'communication',
    );
  }
}
