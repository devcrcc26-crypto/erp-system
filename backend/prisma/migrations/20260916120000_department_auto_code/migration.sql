-- Auto-generated department codes (DEPT-0001, DEPT-0002, …), matching employee IDs.
-- Re-numbers every existing department per company so codes follow the same scheme.

CREATE SEQUENCE IF NOT EXISTS "department_code_seq" START WITH 1 INCREMENT BY 1;

-- Unique constraint is (company_id, code). Stage through temp codes first so
-- sequential assignment cannot collide with a still-in-use mnemonic (IT, MTD, ADD).
UPDATE "department"
SET "code" = 'TMP-' || replace("id", '-', '');

WITH numbered AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "company_id"
      ORDER BY "created_at" ASC, "id" ASC
    ) AS rn
  FROM "department"
)
UPDATE "department" AS d
SET "code" = 'DEPT-' || LPAD(numbered.rn::text, 4, '0')
FROM numbered
WHERE d."id" = numbered."id";

DO $$
DECLARE
  max_n integer;
BEGIN
  SELECT COALESCE(MAX(CAST(substring("code" FROM 6) AS INTEGER)), 0)
  INTO max_n
  FROM "department"
  WHERE "code" ~ '^DEPT-[0-9]+$';

  IF max_n = 0 THEN
    PERFORM setval('department_code_seq', 1, false);
  ELSE
    PERFORM setval('department_code_seq', max_n, true);
  END IF;
END $$;
