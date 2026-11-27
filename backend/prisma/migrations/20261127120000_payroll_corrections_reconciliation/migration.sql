-- Payroll corrections: run versions (reopen), OT entry claims, correction lines,
-- reconciliation items, adjustment types and adjustment lines.

-- CreateEnum
CREATE TYPE "payroll_adjustment_kind" AS ENUM ('EARNING', 'DEDUCTION');

-- CreateEnum
CREATE TYPE "payroll_reconciliation_direction" AS ENUM ('OWED_TO_EMPLOYEE', 'OWED_TO_COMPANY');

-- CreateEnum
CREATE TYPE "payroll_reconciliation_status" AS ENUM ('OPEN', 'PARTIALLY_SETTLED', 'SETTLED', 'WAIVED');

-- AlterTable
ALTER TABLE "overtime_entry" ADD COLUMN     "claimed_at" TIMESTAMP(3),
ADD COLUMN     "claimed_by_run_id" TEXT;

-- AlterTable
ALTER TABLE "payroll_run" ADD COLUMN     "previous_version_id" TEXT,
ADD COLUMN     "reopen_reason" TEXT,
ADD COLUMN     "reopened_at" TIMESTAMP(3),
ADD COLUMN     "reopened_by" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "payroll_entry" ADD COLUMN     "adjustment_deductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "adjustment_non_taxable" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "adjustment_pensionable" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "adjustment_taxable" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "included_ot_entry_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "payroll_adjustment_type" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name_en" VARCHAR(120) NOT NULL,
    "name_zh" VARCHAR(120),
    "kind" "payroll_adjustment_kind" NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT false,
    "pensionable" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "system_field" VARCHAR(40),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_adjustment_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_adjustment_line" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "payroll_run_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "adjustment_type_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "note" VARCHAR(500) NOT NULL,
    "reconciliation_id" TEXT,
    "instalment_number" INTEGER,
    "instalment_count" INTEGER,
    "cap_override_reason" VARCHAR(500),
    "source_line_id" TEXT,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_adjustment_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_reconciliation" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "for_month" INTEGER NOT NULL,
    "for_year" INTEGER NOT NULL,
    "correction_run_id" TEXT NOT NULL,
    "direction" "payroll_reconciliation_direction" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "settled_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "reason" VARCHAR(500) NOT NULL,
    "status" "payroll_reconciliation_status" NOT NULL DEFAULT 'OPEN',
    "waived_reason" VARCHAR(500),
    "waived_by" TEXT,
    "waived_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_reconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_correction_line" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "correction_run_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "component" VARCHAR(40) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(14,2) NOT NULL,
    "corrected_amount" DECIMAL(14,2) NOT NULL,
    "difference" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_correction_line_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_payroll_adjustment_type_company_code" ON "payroll_adjustment_type"("company_id", "code");

-- CreateIndex
CREATE INDEX "idx_payroll_adjustment_line_run_employee" ON "payroll_adjustment_line"("payroll_run_id", "employee_id");

-- CreateIndex
CREATE INDEX "idx_payroll_adjustment_line_reconciliation" ON "payroll_adjustment_line"("reconciliation_id");

-- CreateIndex
CREATE INDEX "idx_payroll_adjustment_line_company" ON "payroll_adjustment_line"("company_id");

-- CreateIndex
CREATE INDEX "idx_payroll_reconciliation_company_status" ON "payroll_reconciliation"("company_id", "status");

-- CreateIndex
CREATE INDEX "idx_payroll_reconciliation_employee" ON "payroll_reconciliation"("employee_id");

-- CreateIndex
CREATE INDEX "idx_payroll_reconciliation_correction_run" ON "payroll_reconciliation"("correction_run_id");

-- CreateIndex
CREATE INDEX "idx_payroll_correction_line_company" ON "payroll_correction_line"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_payroll_correction_line_run_employee_component" ON "payroll_correction_line"("correction_run_id", "employee_id", "component");

-- CreateIndex
CREATE INDEX "idx_overtime_entry_claimed_by_run" ON "overtime_entry"("claimed_by_run_id");

-- CreateIndex
CREATE INDEX "idx_payroll_run_previous_version" ON "payroll_run"("previous_version_id");

-- AddForeignKey
ALTER TABLE "overtime_entry" ADD CONSTRAINT "overtime_entry_claimed_by_run_id_fkey" FOREIGN KEY ("claimed_by_run_id") REFERENCES "payroll_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_run" ADD CONSTRAINT "payroll_run_reopened_by_fkey" FOREIGN KEY ("reopened_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_run" ADD CONSTRAINT "payroll_run_previous_version_id_fkey" FOREIGN KEY ("previous_version_id") REFERENCES "payroll_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustment_type" ADD CONSTRAINT "payroll_adjustment_type_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustment_line" ADD CONSTRAINT "payroll_adjustment_line_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustment_line" ADD CONSTRAINT "payroll_adjustment_line_payroll_run_id_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustment_line" ADD CONSTRAINT "payroll_adjustment_line_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustment_line" ADD CONSTRAINT "payroll_adjustment_line_adjustment_type_id_fkey" FOREIGN KEY ("adjustment_type_id") REFERENCES "payroll_adjustment_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustment_line" ADD CONSTRAINT "payroll_adjustment_line_reconciliation_id_fkey" FOREIGN KEY ("reconciliation_id") REFERENCES "payroll_reconciliation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_reconciliation" ADD CONSTRAINT "payroll_reconciliation_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_reconciliation" ADD CONSTRAINT "payroll_reconciliation_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_reconciliation" ADD CONSTRAINT "payroll_reconciliation_correction_run_id_fkey" FOREIGN KEY ("correction_run_id") REFERENCES "payroll_run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_correction_line" ADD CONSTRAINT "payroll_correction_line_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_correction_line" ADD CONSTRAINT "payroll_correction_line_correction_run_id_fkey" FOREIGN KEY ("correction_run_id") REFERENCES "payroll_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One live run per company / period / run type. SUPERSEDED versions (reopened)
-- and CANCELLED runs are kept for history and do not count.
DROP INDEX IF EXISTS "uq_payroll_run_regular_company_month_year";
CREATE UNIQUE INDEX "uq_payroll_run_live_company_month_year_type"
  ON "payroll_run"("company_id", "month", "year", "type")
  WHERE "deleted_at" IS NULL AND "status" NOT IN ('SUPERSEDED', 'CANCELLED');

-- Built-in adjustment types for every company. Taxable bonus and net bonus map
-- to the existing bonus_top_up / net_top_up fields and calculation.
INSERT INTO "payroll_adjustment_type"
  ("id", "company_id", "code", "name_en", "name_zh", "kind", "taxable", "pensionable",
   "active", "system_field", "sort_order", "created_by", "updated_by")
SELECT gen_random_uuid()::text, c."id", t.code, t.name_en, t.name_zh,
       t.kind::"payroll_adjustment_kind", t.taxable, t.pensionable, true, t.system_field,
       t.sort_order, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'
FROM "company" c
CROSS JOIN (VALUES
  ('TAXABLE_BONUS',  'Taxable bonus',       '应税奖金', 'EARNING',   true,  false, 'BONUS_TOP_UP', 10),
  ('NET_BONUS',      'Net bonus',           '税后奖金', 'EARNING',   false, false, 'NET_TOP_UP',   20),
  ('SEVERANCE_PAY',  'Severance pay',       '遣散费',   'EARNING',   true,  false, NULL,           30),
  ('SALARY_ARREARS', 'Salary arrears',      '补发工资', 'EARNING',   true,  true,  NULL,           40),
  ('RECOVERY',       'Recovery / deduction','扣回款项', 'DEDUCTION', false, false, NULL,           50),
  ('OTHER',          'Other',               '其他',     'EARNING',   true,  false, NULL,           60)
) AS t(code, name_en, name_zh, kind, taxable, pensionable, system_field, sort_order)
WHERE c."deleted_at" IS NULL
ON CONFLICT ("company_id", "code") DO NOTHING;

-- Existing bonus / net top-ups become adjustment lines on runs that can still be
-- recalculated or reopened. Entry amounts are unchanged; PAID, SUPERSEDED and
-- CANCELLED runs are not touched.
INSERT INTO "payroll_adjustment_line"
  ("id", "company_id", "payroll_run_id", "employee_id", "adjustment_type_id",
   "amount", "note", "created_by", "updated_by")
SELECT gen_random_uuid()::text, e."company_id", e."run_id", e."employee_id", t."id",
       e."bonus_top_up", COALESCE(NULLIF(TRIM(e."bonus_top_up_reason"), ''), 'Taxable bonus'),
       e."updated_by", e."updated_by"
FROM "payroll_entry" e
JOIN "payroll_run" r ON r."id" = e."run_id"
JOIN "payroll_adjustment_type" t ON t."company_id" = e."company_id" AND t."code" = 'TAXABLE_BONUS'
WHERE e."bonus_top_up" <> 0
  AND r."deleted_at" IS NULL
  AND r."status" IN ('DRAFT', 'REVIEWED', 'SUBMITTED', 'APPROVED', 'GM_APPROVED');

INSERT INTO "payroll_adjustment_line"
  ("id", "company_id", "payroll_run_id", "employee_id", "adjustment_type_id",
   "amount", "note", "created_by", "updated_by")
SELECT gen_random_uuid()::text, e."company_id", e."run_id", e."employee_id", t."id",
       e."net_top_up", COALESCE(NULLIF(TRIM(e."net_top_up_reason"), ''), 'Net bonus'),
       e."updated_by", e."updated_by"
FROM "payroll_entry" e
JOIN "payroll_run" r ON r."id" = e."run_id"
JOIN "payroll_adjustment_type" t ON t."company_id" = e."company_id" AND t."code" = 'NET_BONUS'
WHERE e."net_top_up" <> 0
  AND r."deleted_at" IS NULL
  AND r."status" IN ('DRAFT', 'REVIEWED', 'SUBMITTED', 'APPROVED', 'GM_APPROVED');

-- OT already paid by an approved / GM-approved / paid regular run is claimed by it,
-- so later runs and corrections never count it twice.
UPDATE "overtime_entry" oe
SET "claimed_by_run_id" = r."id", "claimed_at" = COALESCE(r."approved_at", r."updated_at")
FROM "overtime_sheet" s, "payroll_run" r
WHERE oe."sheet_id" = s."id"
  AND oe."claimed_by_run_id" IS NULL
  AND s."status" = 'APPROVED'
  AND s."deleted_at" IS NULL
  AND r."company_id" = s."company_id"
  AND r."month" = s."month"
  AND r."year" = s."year"
  AND r."type" = 'REGULAR'
  AND r."deleted_at" IS NULL
  AND r."status" IN ('APPROVED', 'GM_APPROVED', 'PAID')
  AND EXISTS (
    SELECT 1 FROM "payroll_entry" pe
    WHERE pe."run_id" = r."id" AND pe."employee_id" = s."employee_id"
  );
