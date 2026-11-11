-- CreateEnum
CREATE TYPE "evaluation_cycle_status" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "evaluation_status" AS ENUM ('PENDING', 'SELF_ASSESSED', 'TEAM_LEAD_ASSESSED', 'DISCIPLINE_ASSESSED', 'RESULT_SHARED', 'ACCEPTED', 'DISPUTED', 'DL_UPHELD', 'DL_ADJUSTED', 'ESCALATED', 'HR_DECIDED', 'LOCKED');

-- CreateEnum
CREATE TYPE "evaluation_stage" AS ENUM ('SELF', 'TEAM_LEAD', 'DISCIPLINE_LEAD', 'HR');

-- CreateEnum
CREATE TYPE "evaluation_dispute_stage" AS ENUM ('SUBMITTED_TO_DL', 'DL_RESPONDED', 'ESCALATED_TO_HR', 'HR_DECIDED');

-- AlterTable
ALTER TABLE "engineering_discipline" ADD COLUMN     "local_leader_id" TEXT;

-- CreateTable
CREATE TABLE "evaluation_template" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "evaluation_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_section" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_zh" TEXT,
    "description" TEXT,
    "weight" DECIMAL(5,2) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT NOT NULL,

    CONSTRAINT "evaluation_section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_criteria" (
    "id" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_zh" TEXT,
    "description" TEXT,
    "weight" DECIMAL(5,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT NOT NULL,

    CONSTRAINT "evaluation_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_cycle" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "quarter" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "eval_start" DATE,
    "eval_end" DATE,
    "status" "evaluation_cycle_status" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "evaluation_cycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_evaluation" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "cycle_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "contract_id" TEXT,
    "team_lead_id" TEXT,
    "discipline_lead_id" TEXT,
    "status" "evaluation_status" NOT NULL DEFAULT 'PENDING',
    "final_score" DECIMAL(5,2),
    "adjusted_score" DECIMAL(5,2),
    "result_shared_at" TIMESTAMP(3),
    "employee_respond_by" TIMESTAMP(3),
    "dl_respond_by" TIMESTAMP(3),
    "dl_adjusted_at" TIMESTAMP(3),
    "employee_adj_respond_by" TIMESTAMP(3),
    "locked_at" TIMESTAMP(3),
    "locked_by" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "employee_evaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_assessment" (
    "id" TEXT NOT NULL,
    "evaluation_id" TEXT NOT NULL,
    "stage" "evaluation_stage" NOT NULL,
    "assessor_id" TEXT NOT NULL,
    "section_avg_json" JSONB,
    "overall_avg" DECIMAL(5,2),
    "comment" TEXT,
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT NOT NULL,

    CONSTRAINT "evaluation_assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_score" (
    "id" TEXT NOT NULL,
    "assessment_id" TEXT NOT NULL,
    "criteria_id" TEXT NOT NULL,
    "score" INTEGER,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT NOT NULL,

    CONSTRAINT "evaluation_score_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_dispute" (
    "id" TEXT NOT NULL,
    "evaluation_id" TEXT NOT NULL,
    "initiated_by" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "stage" "evaluation_dispute_stage" NOT NULL DEFAULT 'SUBMITTED_TO_DL',
    "dl_responded_at" TIMESTAMP(3),
    "dl_responded_by" TEXT,
    "dl_decision" TEXT,
    "dl_comment" TEXT,
    "dl_adjusted_score" DECIMAL(5,2),
    "employee_acknowledged_at" TIMESTAMP(3),
    "employee_decision" TEXT,
    "employee_escalation_reason" TEXT,
    "hr_responded_at" TIMESTAMP(3),
    "hr_responded_by" TEXT,
    "hr_decision" TEXT,
    "hr_comment" TEXT,
    "hr_final_score" DECIMAL(5,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_dispute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_eval_template_company" ON "evaluation_template"("company_id");

-- CreateIndex
CREATE INDEX "idx_eval_section_template" ON "evaluation_section"("template_id");

-- CreateIndex
CREATE INDEX "idx_eval_criteria_section" ON "evaluation_criteria"("section_id");

-- CreateIndex
CREATE INDEX "idx_eval_cycle_company" ON "evaluation_cycle"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_eval_cycle_quarter_year" ON "evaluation_cycle"("company_id", "quarter", "year");

-- CreateIndex
CREATE INDEX "idx_employee_eval_company" ON "employee_evaluation"("company_id");

-- CreateIndex
CREATE INDEX "idx_employee_eval_employee" ON "employee_evaluation"("employee_id");

-- CreateIndex
CREATE INDEX "idx_employee_eval_cycle" ON "employee_evaluation"("cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_eval_cycle_employee" ON "employee_evaluation"("cycle_id", "employee_id");

-- CreateIndex
CREATE INDEX "idx_eval_assessment_evaluation" ON "evaluation_assessment"("evaluation_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_eval_assessment_stage" ON "evaluation_assessment"("evaluation_id", "stage");

-- CreateIndex
CREATE INDEX "idx_eval_score_assessment" ON "evaluation_score"("assessment_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_eval_score_assessment_criteria" ON "evaluation_score"("assessment_id", "criteria_id");

-- CreateIndex
CREATE INDEX "idx_eval_dispute_evaluation" ON "evaluation_dispute"("evaluation_id");

-- CreateIndex
CREATE INDEX "idx_discipline_local_leader" ON "engineering_discipline"("local_leader_id");

-- AddForeignKey
ALTER TABLE "engineering_discipline" ADD CONSTRAINT "engineering_discipline_local_leader_id_fkey" FOREIGN KEY ("local_leader_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_template" ADD CONSTRAINT "evaluation_template_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_template" ADD CONSTRAINT "evaluation_template_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_template" ADD CONSTRAINT "evaluation_template_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_section" ADD CONSTRAINT "evaluation_section_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "evaluation_template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_section" ADD CONSTRAINT "evaluation_section_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_section" ADD CONSTRAINT "evaluation_section_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_criteria" ADD CONSTRAINT "evaluation_criteria_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "evaluation_section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_criteria" ADD CONSTRAINT "evaluation_criteria_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_criteria" ADD CONSTRAINT "evaluation_criteria_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_cycle" ADD CONSTRAINT "evaluation_cycle_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_cycle" ADD CONSTRAINT "evaluation_cycle_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "evaluation_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_cycle" ADD CONSTRAINT "evaluation_cycle_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_cycle" ADD CONSTRAINT "evaluation_cycle_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_evaluation" ADD CONSTRAINT "employee_evaluation_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_evaluation" ADD CONSTRAINT "employee_evaluation_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "evaluation_cycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_evaluation" ADD CONSTRAINT "employee_evaluation_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_evaluation" ADD CONSTRAINT "employee_evaluation_team_lead_id_fkey" FOREIGN KEY ("team_lead_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_evaluation" ADD CONSTRAINT "employee_evaluation_discipline_lead_id_fkey" FOREIGN KEY ("discipline_lead_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_evaluation" ADD CONSTRAINT "employee_evaluation_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "employee_contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_evaluation" ADD CONSTRAINT "employee_evaluation_locked_by_fkey" FOREIGN KEY ("locked_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_evaluation" ADD CONSTRAINT "employee_evaluation_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_evaluation" ADD CONSTRAINT "employee_evaluation_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_assessment" ADD CONSTRAINT "evaluation_assessment_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "employee_evaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_assessment" ADD CONSTRAINT "evaluation_assessment_assessor_id_fkey" FOREIGN KEY ("assessor_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_assessment" ADD CONSTRAINT "evaluation_assessment_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_assessment" ADD CONSTRAINT "evaluation_assessment_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_score" ADD CONSTRAINT "evaluation_score_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "evaluation_assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_score" ADD CONSTRAINT "evaluation_score_criteria_id_fkey" FOREIGN KEY ("criteria_id") REFERENCES "evaluation_criteria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_score" ADD CONSTRAINT "evaluation_score_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_score" ADD CONSTRAINT "evaluation_score_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_dispute" ADD CONSTRAINT "evaluation_dispute_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "employee_evaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_dispute" ADD CONSTRAINT "evaluation_dispute_initiated_by_fkey" FOREIGN KEY ("initiated_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_dispute" ADD CONSTRAINT "evaluation_dispute_dl_responded_by_fkey" FOREIGN KEY ("dl_responded_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_dispute" ADD CONSTRAINT "evaluation_dispute_hr_responded_by_fkey" FOREIGN KEY ("hr_responded_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
