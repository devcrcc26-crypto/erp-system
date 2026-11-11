-- Add discipline leader for leave approval chain (Tier 1 = Discipline Lead).
-- Table is engineering_discipline (Prisma model Discipline).

ALTER TABLE "engineering_discipline"
ADD COLUMN IF NOT EXISTS "leader_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'engineering_discipline_leader_id_fkey'
  ) THEN
    ALTER TABLE "engineering_discipline"
    ADD CONSTRAINT "engineering_discipline_leader_id_fkey"
    FOREIGN KEY ("leader_id") REFERENCES "user"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_discipline_leader"
  ON "engineering_discipline"("leader_id");
