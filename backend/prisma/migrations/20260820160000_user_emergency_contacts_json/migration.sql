-- Store emergency contacts as a JSON array on User
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "emergency_contacts" JSONB;

UPDATE "user"
SET "emergency_contacts" = jsonb_build_array(
  jsonb_strip_nulls(
    jsonb_build_object(
      'firstName', "emergency_contact_first_name",
      'middleName', "emergency_contact_middle_name",
      'lastName', "emergency_contact_last_name",
      'phone', "emergency_contact_phone",
      'email', "emergency_contact_email"
    )
  )
)
WHERE COALESCE(
  "emergency_contact_first_name",
  "emergency_contact_middle_name",
  "emergency_contact_last_name",
  "emergency_contact_phone",
  "emergency_contact_email"
) IS NOT NULL;

ALTER TABLE "user" DROP COLUMN IF EXISTS "emergency_contact_first_name";
ALTER TABLE "user" DROP COLUMN IF EXISTS "emergency_contact_middle_name";
ALTER TABLE "user" DROP COLUMN IF EXISTS "emergency_contact_last_name";
ALTER TABLE "user" DROP COLUMN IF EXISTS "emergency_contact_phone";
ALTER TABLE "user" DROP COLUMN IF EXISTS "emergency_contact_email";
