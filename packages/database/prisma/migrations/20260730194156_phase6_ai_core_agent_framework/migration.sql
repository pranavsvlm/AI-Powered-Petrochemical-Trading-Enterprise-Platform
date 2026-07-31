-- CreateEnum
CREATE TYPE "AiProviderKind" AS ENUM ('OPENAI', 'ANTHROPIC', 'GEMINI', 'OLLAMA');

-- CreateEnum
CREATE TYPE "AgentExecutionStatus" AS ENUM ('RUNNING', 'AWAITING_APPROVAL', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ToolExecutionStatus" AS ENUM ('RUNNING', 'AWAITING_APPROVAL', 'SUCCEEDED', 'FAILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('SYSTEM', 'USER', 'ASSISTANT', 'TOOL');

-- CreateEnum
CREATE TYPE "MemoryScopeType" AS ENUM ('COMPANY', 'CUSTOMER', 'USER', 'CONVERSATION', 'TASK');

-- AlterTable
ALTER TABLE "document_embeddings" ADD COLUMN     "embedding" vector(768),
ADD COLUMN     "metadata" JSONB;

-- CreateTable
CREATE TABLE "ai_provider_configs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "provider" "AiProviderKind" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "base_url" TEXT,
    "default_chat_model" TEXT,
    "default_embed_model" TEXT,
    "api_key_ref" TEXT,
    "monthly_cost_ceiling_usd" DECIMAL(65,30),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_records" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "provider" "AiProviderKind" NOT NULL,
    "model" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "total_tokens" INTEGER,
    "cost_usd" DECIMAL(65,30) NOT NULL,
    "latency_ms" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "error_message" TEXT,
    "requested_by_user_id" TEXT,
    "agent_execution_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_templates" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "key" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prompt_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_template_versions" (
    "id" TEXT NOT NULL,
    "prompt_template_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "capabilities" JSONB NOT NULL,
    "system_prompt_template_key" TEXT NOT NULL,
    "is_built_in" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tools" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "input_schema" JSONB NOT NULL,
    "required_permission_module" TEXT NOT NULL,
    "required_permission_action" "PermissionAction" NOT NULL,
    "requires_human_approval" BOOLEAN NOT NULL DEFAULT false,
    "is_built_in" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_executions" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "requested_by_user_id" TEXT NOT NULL,
    "status" "AgentExecutionStatus" NOT NULL DEFAULT 'RUNNING',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "paused_state" JSONB,
    "error_message" TEXT,
    "total_tokens" INTEGER,
    "total_cost_usd" DECIMAL(65,30),
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_executions" (
    "id" TEXT NOT NULL,
    "agent_execution_id" TEXT NOT NULL,
    "tool_id" TEXT NOT NULL,
    "status" "ToolExecutionStatus" NOT NULL DEFAULT 'RUNNING',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "approval_request_id" TEXT,
    "error_message" TEXT,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tool_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "agent_id" TEXT,
    "subject_type" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "title" TEXT,
    "status" "ConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "tool_name" TEXT,
    "tool_call_id" TEXT,
    "tokens_used" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memories" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "scope_type" "MemoryScopeType" NOT NULL,
    "scope_id" TEXT,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "source_agent_key" TEXT,
    "confidence" DOUBLE PRECISION,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_provider_configs_company_id_idx" ON "ai_provider_configs"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_provider_configs_company_id_provider_key" ON "ai_provider_configs"("company_id", "provider");

-- CreateIndex
CREATE INDEX "ai_usage_records_company_id_created_at_idx" ON "ai_usage_records"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_records_company_id_provider_created_at_idx" ON "ai_usage_records"("company_id", "provider", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_templates_company_id_key_key" ON "prompt_templates"("company_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_template_versions_prompt_template_id_version_key" ON "prompt_template_versions"("prompt_template_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "agents_key_key" ON "agents"("key");

-- CreateIndex
CREATE UNIQUE INDEX "tools_key_key" ON "tools"("key");

-- CreateIndex
CREATE INDEX "agent_executions_company_id_status_idx" ON "agent_executions"("company_id", "status");

-- CreateIndex
CREATE INDEX "agent_executions_company_id_created_at_idx" ON "agent_executions"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "tool_executions_agent_execution_id_idx" ON "tool_executions"("agent_execution_id");

-- CreateIndex
CREATE INDEX "conversations_company_id_subject_type_subject_id_idx" ON "conversations"("company_id", "subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "conversation_messages_conversation_id_idx" ON "conversation_messages"("conversation_id");

-- CreateIndex
CREATE INDEX "memories_company_id_scope_type_scope_id_idx" ON "memories"("company_id", "scope_type", "scope_id");

-- CreateIndex
CREATE UNIQUE INDEX "memories_company_id_scope_type_scope_id_key_key" ON "memories"("company_id", "scope_type", "scope_id", "key");

-- AddForeignKey
ALTER TABLE "ai_provider_configs" ADD CONSTRAINT "ai_provider_configs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_agent_execution_id_fkey" FOREIGN KEY ("agent_execution_id") REFERENCES "agent_executions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_template_versions" ADD CONSTRAINT "prompt_template_versions_prompt_template_id_fkey" FOREIGN KEY ("prompt_template_id") REFERENCES "prompt_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_executions" ADD CONSTRAINT "agent_executions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_executions" ADD CONSTRAINT "agent_executions_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_executions" ADD CONSTRAINT "agent_executions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_executions" ADD CONSTRAINT "tool_executions_agent_execution_id_fkey" FOREIGN KEY ("agent_execution_id") REFERENCES "agent_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_executions" ADD CONSTRAINT "tool_executions_tool_id_fkey" FOREIGN KEY ("tool_id") REFERENCES "tools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex (hand-added: Prisma's migrate diff does not know about pgvector's ANN index
-- types, so this is appended manually — see docs/DOMAIN_MODEL_PHASE6.md §7. ivfflat chosen
-- over hnsw for simplicity at this data volume.)
CREATE INDEX "document_embeddings_embedding_idx" ON "document_embeddings"
  USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);

