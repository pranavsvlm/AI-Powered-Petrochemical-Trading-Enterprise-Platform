import type {
  TenantScopedPrismaClient,
  Conversation,
  ConversationMessage,
  MessageRole,
} from '@platform/database';

export interface CreateConversationInput {
  companyId: string;
  agentId?: string;
  subjectType: string;
  subjectId: string;
  title?: string;
}

export interface AddMessageInput {
  conversationId: string;
  role: MessageRole;
  content: string;
  toolName?: string;
  toolCallId?: string;
  tokensUsed?: number;
}

export class ConversationRepository {
  constructor(private readonly prisma: TenantScopedPrismaClient) {}

  create(input: CreateConversationInput): Promise<Conversation> {
    return this.prisma.conversation.create({
      data: {
        companyId: input.companyId,
        agentId: input.agentId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        title: input.title,
      },
    });
  }

  findById(id: string): Promise<Conversation | null> {
    return this.prisma.conversation.findUnique({ where: { id } });
  }

  list(subjectType: string, subjectId: string): Promise<Conversation[]> {
    return this.prisma.conversation.findMany({
      where: { subjectType, subjectId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  addMessage(input: AddMessageInput): Promise<ConversationMessage> {
    return this.prisma.conversationMessage.create({
      data: {
        conversationId: input.conversationId,
        role: input.role,
        content: input.content,
        toolName: input.toolName,
        toolCallId: input.toolCallId,
        tokensUsed: input.tokensUsed,
      },
    });
  }

  listMessages(conversationId: string): Promise<ConversationMessage[]> {
    return this.prisma.conversationMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
