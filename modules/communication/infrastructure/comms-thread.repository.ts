import type {
  TenantScopedPrismaClient,
  CommsThread,
  CommsParticipant,
  CommsMessage,
  CommsThreadType,
  CommsThreadStatus,
  CommsMessageDirection,
  NotificationChannel,
} from '@platform/database';

export interface CreateThreadInput {
  companyId: string;
  type: CommsThreadType;
  subjectType?: string;
  subjectId?: string;
  title?: string;
  createdByUserId?: string;
}

export interface AddParticipantInput {
  userId?: string;
  externalName?: string;
  externalIdentifier?: string;
}

export interface AddMessageInput {
  direction: CommsMessageDirection;
  channel: NotificationChannel;
  content: string;
  senderUserId?: string;
  senderExternalName?: string;
}

export type ThreadWithChildren = CommsThread & {
  participants: CommsParticipant[];
  messages: CommsMessage[];
};

const THREAD_INCLUDE = {
  participants: { orderBy: { addedAt: 'asc' } },
  messages: { orderBy: { createdAt: 'asc' } },
} as const;

export class CommsThreadRepository {
  constructor(private readonly db: TenantScopedPrismaClient) {}

  create(input: CreateThreadInput): Promise<CommsThread> {
    return this.db.commsThread.create({ data: input });
  }

  findById(id: string): Promise<ThreadWithChildren | null> {
    return this.db.commsThread.findUnique({ where: { id }, include: THREAD_INCLUDE });
  }

  list(filters: {
    companyId: string;
    type?: CommsThreadType;
    status?: CommsThreadStatus;
  }): Promise<CommsThread[]> {
    return this.db.commsThread.findMany({
      where: { companyId: filters.companyId, type: filters.type, status: filters.status },
      orderBy: { updatedAt: 'desc' },
    });
  }

  close(id: string): Promise<CommsThread> {
    return this.db.commsThread.update({ where: { id }, data: { status: 'CLOSED' } });
  }

  addParticipant(threadId: string, input: AddParticipantInput): Promise<CommsParticipant> {
    return this.db.commsParticipant.create({ data: { threadId, ...input } });
  }

  async addMessage(threadId: string, input: AddMessageInput): Promise<CommsMessage> {
    const message = await this.db.commsMessage.create({ data: { threadId, ...input } });
    await this.db.commsThread.update({ where: { id: threadId }, data: { updatedAt: new Date() } });
    return message;
  }

  listMessages(threadId: string): Promise<CommsMessage[]> {
    return this.db.commsMessage.findMany({ where: { threadId }, orderBy: { createdAt: 'asc' } });
  }
}
