-- Who filed a request for whom, approval on behalf of the assigned approver,
-- and crew (multi-employee) site assignments.

CREATE TYPE "RequestInitiatorType" AS ENUM ('SELF', 'SUPERVISOR', 'DELEGATE');

ALTER TABLE "approval_request"
  ADD COLUMN "initiated_as" "RequestInitiatorType";

ALTER TABLE "approval_tier"
  ADD COLUMN "acting_approver_id" TEXT,
  ADD COLUMN "on_behalf_of_approver_id" TEXT;

ALTER TABLE "approval_tier"
  ADD CONSTRAINT "approval_tier_acting_approver_id_fkey"
  FOREIGN KEY ("acting_approver_id") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "approval_tier"
  ADD CONSTRAINT "approval_tier_on_behalf_of_approver_id_fkey"
  FOREIGN KEY ("on_behalf_of_approver_id") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "site_assignment"
  ADD COLUMN "crew_id" TEXT;

CREATE INDEX "idx_site_assignment_crew" ON "site_assignment"("crew_id");
