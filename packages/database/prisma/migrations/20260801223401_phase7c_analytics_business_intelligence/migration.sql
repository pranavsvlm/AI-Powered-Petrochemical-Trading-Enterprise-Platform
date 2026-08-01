-- CreateEnum
CREATE TYPE "ForecastType" AS ENUM ('SALES');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('EXECUTIVE', 'SALES', 'TRADING', 'FINANCE', 'INVENTORY', 'PROCUREMENT', 'AI_USAGE');

-- CreateEnum
CREATE TYPE "ReportFormat" AS ENUM ('PDF', 'CSV');

-- CreateEnum
CREATE TYPE "ReportScheduleFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "AIInsightType" AS ENUM ('BUSINESS_BRIEFING');

-- CreateTable
CREATE TABLE "analytics_snapshots" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metrics" JSONB NOT NULL,

    CONSTRAINT "analytics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecasts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "type" "ForecastType" NOT NULL,
    "horizon_months" INTEGER NOT NULL,
    "basis_periods" INTEGER NOT NULL,
    "projected_value" DECIMAL(65,30) NOT NULL,
    "generated_by_user_id" TEXT,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_insights" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "type" "AIInsightType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "type" "ReportType" NOT NULL,
    "format" "ReportFormat" NOT NULL,
    "document_id" TEXT,
    "schedule_id" TEXT,
    "generated_by_user_id" TEXT,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_schedules" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "report_type" "ReportType" NOT NULL,
    "format" "ReportFormat" NOT NULL,
    "frequency" "ReportScheduleFrequency" NOT NULL,
    "recipient_emails" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_run_at" TIMESTAMP(3),
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analytics_snapshots_company_id_captured_at_idx" ON "analytics_snapshots"("company_id", "captured_at");

-- CreateIndex
CREATE INDEX "forecasts_company_id_type_generated_at_idx" ON "forecasts"("company_id", "type", "generated_at");

-- CreateIndex
CREATE INDEX "ai_insights_company_id_generated_at_idx" ON "ai_insights"("company_id", "generated_at");

-- CreateIndex
CREATE INDEX "reports_company_id_type_generated_at_idx" ON "reports"("company_id", "type", "generated_at");

-- CreateIndex
CREATE INDEX "report_schedules_company_id_is_active_idx" ON "report_schedules"("company_id", "is_active");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "report_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

