-- Migrate project.contract_type from free-text to ProjectContractType enum (4 values).
-- NULL and empty strings become NO_ASSIGNMENT; column is NOT NULL with default.

UPDATE "project"
SET "contract_type" = 'NO_ASSIGNMENT'
WHERE "contract_type" IS NULL OR TRIM("contract_type") = '';

UPDATE "project"
SET "contract_type" = 'CONTRACT'
WHERE UPPER(TRIM("contract_type")) IN ('LUMP_SUM', 'COST_PLUS', 'UNIT_PRICE', 'CONTRACT')
   OR LOWER(TRIM("contract_type")) IN ('lump sum', 'lump_sum');

UPDATE "project"
SET "contract_type" = 'EMAIL'
WHERE LOWER(TRIM("contract_type")) LIKE '%email%'
   OR UPPER(TRIM("contract_type")) = 'EMAIL';

UPDATE "project"
SET "contract_type" = 'INFORMAL_ASSIGNMENT'
WHERE LOWER("contract_type") LIKE '%informal%'
   OR UPPER(TRIM("contract_type")) IN ('INFORMAL_ASSIGNMENT', 'INFORMAL');

UPDATE "project"
SET "contract_type" = 'NO_ASSIGNMENT'
WHERE UPPER(TRIM("contract_type")) IN ('NO_ASSIGNMENT', 'NONE', 'NO ASSIGNMENT');

UPDATE "project"
SET "contract_type" = 'CONTRACT'
WHERE "contract_type" NOT IN (
  'CONTRACT',
  'EMAIL',
  'INFORMAL_ASSIGNMENT',
  'NO_ASSIGNMENT'
);

CREATE TYPE "ProjectContractType" AS ENUM (
  'CONTRACT',
  'EMAIL',
  'INFORMAL_ASSIGNMENT',
  'NO_ASSIGNMENT'
);

ALTER TABLE "project"
  ALTER COLUMN "contract_type" TYPE "ProjectContractType"
  USING "contract_type"::"ProjectContractType";

ALTER TABLE "project"
  ALTER COLUMN "contract_type" SET NOT NULL;

ALTER TABLE "project"
  ALTER COLUMN "contract_type" SET DEFAULT 'NO_ASSIGNMENT';
