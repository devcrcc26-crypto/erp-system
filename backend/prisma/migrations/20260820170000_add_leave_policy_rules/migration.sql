-- AlterTable
ALTER TABLE "leave_policy" ADD COLUMN IF NOT EXISTS "governed_by" TEXT;

-- AddForeignKey for LeavePolicy creator (created_by already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leave_policy_created_by_fkey'
  ) THEN
    ALTER TABLE "leave_policy"
      ADD CONSTRAINT "leave_policy_created_by_fkey"
      FOREIGN KEY ("created_by") REFERENCES "user"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "leave_policy_rule" (
    "id" TEXT NOT NULL,
    "leave_policy_id" TEXT NOT NULL,
    "leave_type" "LeaveType" NOT NULL,
    "base_days" DECIMAL(5,1) NOT NULL,
    "is_progressive" BOOLEAN NOT NULL DEFAULT false,
    "increment_days" DECIMAL(5,1),
    "increment_every_years" INTEGER,
    "minimum_service_months" INTEGER NOT NULL DEFAULT 0,
    "max_days_cap" DECIMAL(5,1),
    "max_carry_forward_days" DECIMAL(5,1),
    "requires_receipt" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_policy_rule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "uq_leave_policy_rule_policy_type"
  ON "leave_policy_rule"("leave_policy_id", "leave_type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_leave_policy_rule_policy"
  ON "leave_policy_rule"("leave_policy_id");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leave_policy_rule_leave_policy_id_fkey'
  ) THEN
    ALTER TABLE "leave_policy_rule"
      ADD CONSTRAINT "leave_policy_rule_leave_policy_id_fkey"
      FOREIGN KEY ("leave_policy_id") REFERENCES "leave_policy"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
