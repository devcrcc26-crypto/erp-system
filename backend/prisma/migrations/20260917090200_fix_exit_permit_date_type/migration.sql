-- Exit permits apply to a calendar day, not an instant.
-- Stored values are UTC timestamps; convert to the Addis Ababa calendar day before casting.
ALTER TABLE "exit_permit"
ALTER COLUMN "date" DROP DEFAULT;

ALTER TABLE "exit_permit"
ALTER COLUMN "date" TYPE DATE
USING (("date" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Addis_Ababa')::date;
