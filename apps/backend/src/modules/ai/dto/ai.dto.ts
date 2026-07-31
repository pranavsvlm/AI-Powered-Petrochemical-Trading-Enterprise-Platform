import { IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

const MEMORY_SCOPE_TYPES = ['COMPANY', 'CUSTOMER', 'USER', 'CONVERSATION', 'TASK'] as const;
const AI_PROVIDER_KINDS = ['OPENAI', 'ANTHROPIC', 'GEMINI', 'OLLAMA'] as const;
const AGENT_EXECUTION_STATUSES = [
  'RUNNING',
  'AWAITING_APPROVAL',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;

export class ChatDto {
  @IsString()
  @IsNotEmpty()
  agentKey!: string;

  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsOptional()
  @IsString()
  conversationId?: string;
}

export class ExecuteDto {
  @IsString()
  @IsNotEmpty()
  agentKey!: string;

  @IsString()
  @IsNotEmpty()
  message!: string;
}

export class DecideExecutionDto {
  @IsOptional()
  @IsString()
  comment?: string;
}

export class ListExecutionsQueryDto {
  @IsOptional()
  @IsIn(AGENT_EXECUTION_STATUSES)
  status?: (typeof AGENT_EXECUTION_STATUSES)[number];
}

export class ListMemoryQueryDto {
  @IsIn(MEMORY_SCOPE_TYPES)
  scopeType!: (typeof MEMORY_SCOPE_TYPES)[number];

  @IsOptional()
  @IsString()
  scopeId?: string;
}

export class UpsertProviderDto {
  @IsIn(AI_PROVIDER_KINDS)
  provider!: (typeof AI_PROVIDER_KINDS)[number];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsNumber()
  priority?: number;

  @IsOptional()
  @IsString()
  baseUrl?: string;

  @IsOptional()
  @IsString()
  defaultChatModel?: string;

  @IsOptional()
  @IsString()
  defaultEmbedModel?: string;

  @IsOptional()
  @IsString()
  apiKeyRef?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyCostCeilingUsd?: number;
}
