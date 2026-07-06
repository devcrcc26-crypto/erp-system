-- Phase 4: canonical subtask role columns on design_package (rename 5 + add 2)

ALTER TABLE design_package
  RENAME COLUMN package_owner_user_id TO discipline_owner_user_id;

ALTER TABLE design_package
  RENAME COLUMN package_reviewer_user_id TO reviewer_user_id;

ALTER TABLE design_package
  RENAME COLUMN package_discipline_lead_user_id TO disciplinary_leader_user_id;

ALTER TABLE design_package
  RENAME COLUMN package_chief_user_id TO dept_deputy_chief_user_id;

ALTER TABLE design_package
  RENAME COLUMN package_institute_chief_user_id TO institute_chief_user_id;

ALTER TABLE design_package
  ADD COLUMN IF NOT EXISTS designer_user_id TEXT,
  ADD COLUMN IF NOT EXISTS supporting_designer_user_id TEXT;

ALTER TABLE design_package
  ADD CONSTRAINT design_package_designer_user_id_fkey
    FOREIGN KEY (designer_user_id) REFERENCES "user"(id)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE design_package
  ADD CONSTRAINT design_package_supporting_designer_user_id_fkey
    FOREIGN KEY (supporting_designer_user_id) REFERENCES "user"(id)
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS idx_design_package_designer_user_id
  ON design_package (designer_user_id);

CREATE INDEX IF NOT EXISTS idx_design_package_supporting_designer_user_id
  ON design_package (supporting_designer_user_id);

-- Copy-down: fill null subtask roles from parent task_discipline
UPDATE design_package AS dp
SET
  designer_user_id = COALESCE(dp.designer_user_id, td.designer_user_id),
  discipline_owner_user_id = COALESCE(dp.discipline_owner_user_id, td.owner_user_id),
  reviewer_user_id = COALESCE(dp.reviewer_user_id, td.reviewer_user_id),
  disciplinary_leader_user_id = COALESCE(
    dp.disciplinary_leader_user_id,
    td.discipline_lead_user_id
  ),
  dept_deputy_chief_user_id = COALESCE(dp.dept_deputy_chief_user_id, td.chief_user_id),
  institute_chief_user_id = COALESCE(
    dp.institute_chief_user_id,
    td.institute_chief_user_id
  ),
  supporting_designer_user_id = COALESCE(
    dp.supporting_designer_user_id,
    td.supporting_designer_user_id
  )
FROM task_discipline AS td
WHERE dp.task_discipline_id = td.id
  AND dp.deleted_at IS NULL
  AND td.deleted_at IS NULL;
