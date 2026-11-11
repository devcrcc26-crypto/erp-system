-- Additive migration: adds a nullable column to review_session recording
-- the external Institute Chief's name when a DEPT_CHIEF approves the
-- INSTITUTE_CHIEF tier on their behalf (proxy approval, only reachable when
-- the package has instituteChiefName set instead of instituteChiefUserId).

ALTER TABLE review_session ADD COLUMN institute_chief_approved_on_behalf_of_name TEXT;
