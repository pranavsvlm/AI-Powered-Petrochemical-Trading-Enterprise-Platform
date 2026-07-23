-- AlterEnum
-- Removes QuotationStatus.REJECTED: rejection is recorded on ApprovalRequest.status, and a
-- rejected quotation reopens straight to NEGOTIATING — see docs/DOMAIN_MODEL_PHASE4.md and the
-- comment on QuotationStatus in schema.prisma.
BEGIN;
CREATE TYPE "QuotationStatus_new" AS ENUM ('DRAFT', 'SENT', 'NEGOTIATING', 'PENDING_APPROVAL', 'APPROVED', 'CONVERTED', 'CANCELLED');
ALTER TABLE "quotations" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "quotations" ALTER COLUMN "status" TYPE "QuotationStatus_new" USING ("status"::text::"QuotationStatus_new");
ALTER TYPE "QuotationStatus" RENAME TO "QuotationStatus_old";
ALTER TYPE "QuotationStatus_new" RENAME TO "QuotationStatus";
DROP TYPE "QuotationStatus_old";
ALTER TABLE "quotations" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;
