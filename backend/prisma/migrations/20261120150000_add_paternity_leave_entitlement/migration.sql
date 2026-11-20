-- Align leave entitlements with Ethiopian Labour Proclamation No. 1156/2019:
-- maternity 120 days; paternity as its own 3-day balance bucket (male-only).

-- 1) Maternity policy rules: 90 → 120
UPDATE "leave_policy_rule"
SET "base_days" = 120
WHERE "leave_type" = 'MATERNITY'
  AND "base_days" = 90;

-- 2) Paternity policy rules for every active policy that lacks one
INSERT INTO "leave_policy_rule" (
  "id",
  "leave_policy_id",
  "leave_type",
  "base_days",
  "is_progressive",
  "increment_days",
  "increment_every_years",
  "minimum_service_months",
  "max_days_cap",
  "max_carry_forward_days",
  "requires_receipt",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid()::text,
  p."id",
  'PATERNITY',
  3,
  false,
  NULL,
  NULL,
  0,
  NULL,
  NULL,
  false,
  NOW(),
  NOW()
FROM "leave_policy" p
WHERE p."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "leave_policy_rule" r
    WHERE r."leave_policy_id" = p."id"
      AND r."leave_type" = 'PATERNITY'
  );

-- 3) Maternity leave_balance cache: entitled 90 → 120
UPDATE "leave_balance"
SET "entitled" = 120,
    "updated_at" = NOW()
WHERE "leave_type" = 'MATERNITY'
  AND "entitled" = 90;

-- 4) Maternity ledger entitlement / opening rows that still say 90
UPDATE "leave_balance_entry"
SET "days" = 120
WHERE "leave_type" = 'MATERNITY'
  AND "kind" IN ('ENTITLEMENT', 'OPENING_BALANCE')
  AND "days" = 90;

-- 5) Paternity leave_balance for males who already have an annual balance year
INSERT INTO "leave_balance" (
  "id",
  "company_id",
  "employee_id",
  "year",
  "leave_type",
  "entitled",
  "brought_forward",
  "used",
  "pending",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid()::text,
  b."company_id",
  b."employee_id",
  b."year",
  'PATERNITY',
  3,
  0,
  0,
  0,
  NOW(),
  NOW()
FROM "leave_balance" b
JOIN "user" u ON u."id" = b."employee_id"
WHERE u."gender" = 'MALE'
  AND u."deleted_at" IS NULL
  AND b."leave_type" = 'ANNUAL'
  AND NOT EXISTS (
    SELECT 1
    FROM "leave_balance" pb
    WHERE pb."company_id" = b."company_id"
      AND pb."employee_id" = b."employee_id"
      AND pb."year" = b."year"
      AND pb."leave_type" = 'PATERNITY'
  );

-- 6) Paternity ledger ENTITLEMENT rows aligned to each male annual entitlement year
INSERT INTO "leave_balance_entry" (
  "id",
  "company_id",
  "employee_id",
  "leave_type",
  "leave_year_start",
  "leave_year_end",
  "kind",
  "days",
  "reason",
  "dedupe_key",
  "source_contract_id",
  "source_leave_request_id",
  "created_by_id",
  "created_at"
)
SELECT
  gen_random_uuid()::text,
  e."company_id",
  e."employee_id",
  'PATERNITY',
  e."leave_year_start",
  e."leave_year_end",
  'ENTITLEMENT',
  3,
  'Paternity leave entitlement (Labour Proclamation 1156/2019)',
  'ENTITLEMENT:' || e."employee_id" || ':PATERNITY:' || to_char(e."leave_year_start", 'YYYY-MM-DD') || ':migration',
  NULL,
  NULL,
  NULL,
  NOW()
FROM "leave_balance_entry" e
JOIN "user" u ON u."id" = e."employee_id"
WHERE u."gender" = 'MALE'
  AND u."deleted_at" IS NULL
  AND e."leave_type" = 'ANNUAL'
  AND e."kind" = 'ENTITLEMENT'
  AND NOT EXISTS (
    SELECT 1
    FROM "leave_balance_entry" pe
    WHERE pe."employee_id" = e."employee_id"
      AND pe."leave_type" = 'PATERNITY'
      AND pe."leave_year_start" = e."leave_year_start"
  );
