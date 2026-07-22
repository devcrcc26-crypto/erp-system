-- Persist EDVs excluded from external release before issue.
ALTER TABLE "submittal_item"
ADD COLUMN "excluded_edv_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
