import type { Conversation, ConversationMessage, MessageRole } from '@platform/database';
import type {
  AddMessageInput,
  ConversationRepository,
  CreateConversationInput,
} from '../infrastructure/conversation.repository';

export class ConversationService {
  constructor(private readonly repo: ConversationRepository) {}

  create(input: CreateConversationInput): Promise<Conversation> {
    return this.repo.create(input);
  }

  findById(id: string): Promise<Conversation | null> {
    return this.repo.findById(id);
  }

  list(subjectType: string, subjectId: string): Promise<Conversation[]> {
    return this.repo.list(subjectType, subjectId);
  }

  addMessage(
    conversationId: string,
    role: MessageRole,
    content: string,
    options: { toolName?: string; toolCallId?: string; tokensUsed?: number } = {},
  ): Promise<ConversationMessage> {
    return this.repo.addMessage({ conversationId, role, content, ...options } as AddMessageInput);
  }

  listMessages(conversationId: string): Promise<ConversationMessage[]> {
    return this.repo.listMessages(conversationId);
  }
}
