-- Phase 7b: Communication Management (doc 19) — see docs/DOMAIN_MODEL_PHASE7.md.
--
-- Hand-generated via `prisma migrate diff` against the live dev database, same workaround
-- Phases 6 and 7a already needed (the shadow-database step `prisma migrate dev` requires fails
-- on this schema — no pgvector extension in the shadow DB for Phase 6's `vector(768)` column).
-- The raw diff also always proposes dropping `document_embeddings_embedding_idx`/
-- `documents_search_vector_idx` and an unrelated `ALTER TABLE documents ALTER COLUMN
-- search_vector DROP DEFAULT` — pre-existing drift Prisma can't explain because it doesn't
-- understand Phases 3/6's hand-added raw-SQL ivfflat/tsvector objects. Those three statements
-- are deliberately excluded here; everything else is unmodified Prisma output.

-- CreateEnum
CREATE TYPE "CommsThreadType" AS ENUM ('CUSTOMER', 'SUPPLIER', 'INTERNAL', 'ANNOUNCEMENT');

-- CreateEnum
CREATE TYPE "CommsThreadStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "CommsMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'MESSAGE';

-- CreateTable
CREATE TABLE "comms_threads" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "type" "CommsThreadType" NOT NULL,
    "status" "CommsThreadStatus" NOT NULL DEFAULT 'ACTIVE',
    "subject_type" TEXT,
    "subject_id" TEXT,
    "title" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comms_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comms_participants" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "user_id" TEXT,
    "external_name" TEXT,
    "external_identifier" TEXT,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comms_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comms_messages" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "sender_user_id" TEXT,
    "sender_external_name" TEXT,
    "direction" "CommsMessageDirection" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comms_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "comms_threads_company_id_idx" ON "comms_threads"("company_id");

-- CreateIndex
CREATE INDEX "comms_threads_company_id_subject_type_subject_id_idx" ON "comms_threads"("company_id", "subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "comms_participants_thread_id_idx" ON "comms_participants"("thread_id");

-- CreateIndex
CREATE INDEX "comms_messages_thread_id_idx" ON "comms_messages"("thread_id");

-- AddForeignKey
ALTER TABLE "comms_participants" ADD CONSTRAINT "comms_participants_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "comms_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comms_messages" ADD CONSTRAINT "comms_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "comms_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
