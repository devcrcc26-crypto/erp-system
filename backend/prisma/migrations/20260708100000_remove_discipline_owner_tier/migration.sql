-- Additive/corrective data-only migration: no schema change.
-- Removes DISCIPLINE_OWNER from the requiredTiers approval sequence
-- on existing DesignPackage rows. In-flight ReviewSessions currently
-- sitting at currentTier = DISCIPLINE_OWNER are left untouched per
-- explicit decision -- they will complete that tier normally; no new
-- session will ever start at DISCIPLINE_OWNER again once this ships
-- alongside the corresponding computeRequiredTiers code change.

UPDATE design_package
SET required_tiers = array_remove(required_tiers, 'DISCIPLINE_OWNER'::"ReviewTier")
WHERE 'DISCIPLINE_OWNER'::"ReviewTier" = ANY(required_tiers)
  AND deleted_at IS NULL;
