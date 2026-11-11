-- Freelancers always pay pension: switch it on for their existing contracts.
UPDATE "employee_contract" AS c
SET "pension_applicable" = TRUE
FROM "user" AS u
WHERE c."employee_id" = u."id"
  AND u."employee_type" = 'FREELANCER'
  AND c."pension_applicable" = FALSE;
