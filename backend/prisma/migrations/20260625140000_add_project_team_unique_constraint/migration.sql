-- Remove duplicate project team rows before adding the unique constraint.
DELETE FROM "project_team" duplicate
USING "project_team" keeper
WHERE duplicate."project_id" = keeper."project_id"
  AND duplicate."user_id" = keeper."user_id"
  AND duplicate."id" > keeper."id";

-- CreateIndex
CREATE UNIQUE INDEX "project_team_member_unique" ON "project_team"("project_id", "user_id");
