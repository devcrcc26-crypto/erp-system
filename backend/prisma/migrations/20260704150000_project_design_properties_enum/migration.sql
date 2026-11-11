-- Migrate project.design_properties from free-text to ProjectDesignProperties enum (5 values).

UPDATE "project"
SET "design_properties" = 'PRELIMINARY'
WHERE "design_properties" IS NULL OR TRIM("design_properties") = '';

UPDATE "project"
SET "design_properties" = 'IMPLEMENTATION_DBB'
WHERE "design_properties" NOT IN (
    'PRELIMINARY',
    'GEOTECNICAL_INVESTIGATION',
    'SURVEY',
    'IMPLEMENTATION_DB',
    'IMPLEMENTATION_DBB'
  )
  AND (
    LOWER(TRIM("design_properties")) IN (
      'design-bid-build',
      'design bid build',
      'dbb',
      'implementation_dbb'
    )
    OR LOWER("design_properties") LIKE '%design-bid-build%'
    OR LOWER("design_properties") LIKE '%design bid build%'
    OR LOWER("design_properties") LIKE '%dbb%'
    OR "design_properties" LIKE '%（DBB）%'
    OR "design_properties" ILIKE '%(dbb)%'
  );

UPDATE "project"
SET "design_properties" = 'IMPLEMENTATION_DB'
WHERE "design_properties" NOT IN (
    'PRELIMINARY',
    'GEOTECNICAL_INVESTIGATION',
    'SURVEY',
    'IMPLEMENTATION_DB',
    'IMPLEMENTATION_DBB'
  )
  AND (
    LOWER(TRIM("design_properties")) IN (
      'design-build',
      'design build',
      'epc',
      'implementation_db'
    )
    OR LOWER("design_properties") LIKE '%design-build%'
    OR LOWER("design_properties") LIKE '%design build%'
    OR LOWER(TRIM("design_properties")) = 'epc'
    OR "design_properties" LIKE '%（DB）%'
    OR "design_properties" ILIKE '%(db)%'
  );

UPDATE "project"
SET "design_properties" = 'GEOTECNICAL_INVESTIGATION'
WHERE "design_properties" NOT IN (
    'PRELIMINARY',
    'GEOTECNICAL_INVESTIGATION',
    'SURVEY',
    'IMPLEMENTATION_DB',
    'IMPLEMENTATION_DBB'
  )
  AND (
    LOWER("design_properties") LIKE '%geotec%'
    OR LOWER("design_properties") LIKE '%geotech%'
    OR LOWER("design_properties") LIKE '%investigation%'
  );

UPDATE "project"
SET "design_properties" = 'SURVEY'
WHERE "design_properties" NOT IN (
    'PRELIMINARY',
    'GEOTECNICAL_INVESTIGATION',
    'SURVEY',
    'IMPLEMENTATION_DB',
    'IMPLEMENTATION_DBB'
  )
  AND LOWER("design_properties") LIKE '%survey%';

UPDATE "project"
SET "design_properties" = 'PRELIMINARY'
WHERE "design_properties" NOT IN (
    'PRELIMINARY',
    'GEOTECNICAL_INVESTIGATION',
    'SURVEY',
    'IMPLEMENTATION_DB',
    'IMPLEMENTATION_DBB'
  )
  AND (
    LOWER(TRIM("design_properties")) IN ('preliminary', 'prelim', 'consultancy')
    OR LOWER("design_properties") LIKE '%prelim%'
  );

UPDATE "project"
SET "design_properties" = 'PRELIMINARY'
WHERE "design_properties" NOT IN (
  'PRELIMINARY',
  'GEOTECNICAL_INVESTIGATION',
  'SURVEY',
  'IMPLEMENTATION_DB',
  'IMPLEMENTATION_DBB'
);

CREATE TYPE "ProjectDesignProperties" AS ENUM (
  'PRELIMINARY',
  'GEOTECNICAL_INVESTIGATION',
  'SURVEY',
  'IMPLEMENTATION_DB',
  'IMPLEMENTATION_DBB'
);

ALTER TABLE "project"
  ALTER COLUMN "design_properties" TYPE "ProjectDesignProperties"
  USING "design_properties"::"ProjectDesignProperties";

ALTER TABLE "project"
  ALTER COLUMN "design_properties" SET NOT NULL;

ALTER TABLE "project"
  ALTER COLUMN "design_properties" SET DEFAULT 'PRELIMINARY';
