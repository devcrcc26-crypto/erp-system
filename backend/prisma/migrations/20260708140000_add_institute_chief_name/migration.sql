-- Additive migration: adds a nullable instituteChiefName column to
-- design_package, as an alternative to instituteChiefUserId for an external
-- Institute Chief who has no account in the system. Only one of the two is
-- ever populated at a time (enforced in application code).

ALTER TABLE design_package ADD COLUMN institute_chief_name TEXT;
