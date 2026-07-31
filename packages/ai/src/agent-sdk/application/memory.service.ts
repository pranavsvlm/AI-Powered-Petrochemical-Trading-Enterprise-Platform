import type { Memory, MemoryScopeType } from '@platform/database';
import type { MemoryRepository, UpsertMemoryInput } from '../infrastructure/memory.repository';

export class MemoryService {
  constructor(private readonly repo: MemoryRepository) {}

  remember(input: UpsertMemoryInput): Promise<Memory> {
    return this.repo.upsert(input);
  }

  recall(scopeType: MemoryScopeType, scopeId: string | null, key: string): Promise<Memory | null> {
    return this.repo.get(scopeType, scopeId, key);
  }

  list(scopeType: MemoryScopeType, scopeId?: string | null): Promise<Memory[]> {
    return this.repo.list(scopeType, scopeId);
  }
}
