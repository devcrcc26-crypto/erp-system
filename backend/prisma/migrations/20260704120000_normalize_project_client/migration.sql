-- Normalize project.client: trim values, empty -> NULL, standardize CCECC preset spellings.
-- Custom client names are preserved unchanged. Column stays nullable TEXT.

UPDATE "project"
SET "client" = NULL
WHERE "client" IS NOT NULL AND TRIM("client") = '';

UPDATE "project"
SET "client" = TRIM("client")
WHERE "client" IS NOT NULL;

UPDATE "project"
SET "client" = 'CCECC Ethiopia'
WHERE "client" IS NOT NULL
  AND "client" <> 'CCECC Ethiopia'
  AND (
    LOWER("client") = 'ccecc ethiopia'
    OR (
      LOWER("client") LIKE '%ccecc%'
      AND LOWER("client") LIKE '%ethiopia%'
    )
  );

UPDATE "project"
SET "client" = 'CCECC Djibouti'
WHERE "client" IS NOT NULL
  AND "client" <> 'CCECC Djibouti'
  AND (
    LOWER("client") = 'ccecc djibouti'
    OR (
      LOWER("client") LIKE '%ccecc%'
      AND LOWER("client") LIKE '%djibouti%'
    )
  );

UPDATE "project"
SET "client" = 'CCECC Kenya'
WHERE "client" IS NOT NULL
  AND "client" <> 'CCECC Kenya'
  AND (
    LOWER("client") = 'ccecc kenya'
    OR (
      LOWER("client") LIKE '%ccecc%'
      AND LOWER("client") LIKE '%kenya%'
    )
  );
