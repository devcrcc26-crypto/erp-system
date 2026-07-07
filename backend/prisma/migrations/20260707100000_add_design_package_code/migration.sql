-- Adds a sequential human-readable code to design packages (subtasks),
-- mirroring task.task_id_code. Previously the UI showed the first 8 chars
-- of the package's UUID as a pseudo-code, which for many deterministically
-- seeded ids rendered as "00000000" for every row.

ALTER TABLE "design_package" ADD COLUMN IF NOT EXISTS "package_code" TEXT;

-- Give every active company a SUBTASK number series + backing sequence,
-- and backfill existing design packages with sequential codes so the
-- column can be made NOT NULL below.
DO $$
DECLARE
  comp_id TEXT;
  seq_name TEXT;
  admin_id TEXT;
  package_count INT;
BEGIN
  FOR comp_id IN SELECT id FROM "company" WHERE deleted_at IS NULL LOOP
    SELECT id INTO admin_id
    FROM "user"
    WHERE company_id = comp_id AND deleted_at IS NULL
    ORDER BY created_at ASC
    LIMIT 1;

    IF admin_id IS NULL THEN
      CONTINUE;
    END IF;

    seq_name := 'seq_' || replace(comp_id, '-', '_') || '_subtask';
    EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I START WITH 1 INCREMENT BY 1', seq_name);

    INSERT INTO "number_series" (
      id, company_id, document_type, prefix, suffix, sequence_name, padding,
      reset_frequency, created_at, created_by, updated_at, updated_by
    ) VALUES (
      gen_random_uuid(), comp_id, 'SUBTASK', 'SUB-', '', seq_name, 5,
      'NEVER', NOW(), admin_id, NOW(), admin_id
    )
    ON CONFLICT (company_id, document_type) DO NOTHING;

    WITH ordered AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
      FROM "design_package"
      WHERE company_id = comp_id AND package_code IS NULL
    )
    UPDATE "design_package" dp
    SET package_code = 'SUB-' || LPAD(ordered.rn::text, 5, '0')
    FROM ordered
    WHERE dp.id = ordered.id;

    SELECT COUNT(*) INTO package_count FROM "design_package" WHERE company_id = comp_id;
    IF package_count > 0 THEN
      PERFORM setval(seq_name, package_count);
    END IF;
  END LOOP;
END $$;

-- Fallback for any design packages belonging to a company with no active
-- user found above (edge case) so NOT NULL can still be enforced safely.
UPDATE "design_package"
SET package_code = 'SUB-' || substr(replace(id, '-', ''), 1, 8)
WHERE package_code IS NULL;

ALTER TABLE "design_package" ALTER COLUMN "package_code" SET NOT NULL;
