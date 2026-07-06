-- Fix malformed engineering_discipline ids seeded by
-- 20260706120000_phase2_engineering_discipline.
--
-- Those rows were inserted with an 8-hex-character final UUID group
-- (e.g. 'd1000000-0000-4000-8000-00000007') instead of the required
-- 12 characters ('d1000000-0000-4000-8000-000000000007'). The column
-- is plain TEXT so Postgres accepted them, but the app's UUID-shape
-- validator (IsEntityUuid) correctly rejects them, which made
-- "Add discipline" on a task fail with "disciplineId must be a UUID"
-- for every discipline in the catalog.
--
-- engineering_discipline.id is the PK referenced by
-- task_discipline.discipline_id and "user".engineering_discipline_id,
-- both declared ON UPDATE CASCADE, so updating the id here also
-- repairs every row that already points at it.

UPDATE "engineering_discipline" SET "id" = 'd1000000-0000-4000-8000-000000000001' WHERE "id" = 'd1000000-0000-4000-8000-00000001';
UPDATE "engineering_discipline" SET "id" = 'd1000000-0000-4000-8000-000000000002' WHERE "id" = 'd1000000-0000-4000-8000-00000002';
UPDATE "engineering_discipline" SET "id" = 'd1000000-0000-4000-8000-000000000003' WHERE "id" = 'd1000000-0000-4000-8000-00000003';
UPDATE "engineering_discipline" SET "id" = 'd1000000-0000-4000-8000-000000000004' WHERE "id" = 'd1000000-0000-4000-8000-00000004';
UPDATE "engineering_discipline" SET "id" = 'd1000000-0000-4000-8000-000000000005' WHERE "id" = 'd1000000-0000-4000-8000-00000005';
UPDATE "engineering_discipline" SET "id" = 'd1000000-0000-4000-8000-000000000006' WHERE "id" = 'd1000000-0000-4000-8000-00000006';
UPDATE "engineering_discipline" SET "id" = 'd1000000-0000-4000-8000-000000000007' WHERE "id" = 'd1000000-0000-4000-8000-00000007';
UPDATE "engineering_discipline" SET "id" = 'd1000000-0000-4000-8000-000000000008' WHERE "id" = 'd1000000-0000-4000-8000-00000008';
UPDATE "engineering_discipline" SET "id" = 'd1000000-0000-4000-8000-000000000009' WHERE "id" = 'd1000000-0000-4000-8000-00000009';
UPDATE "engineering_discipline" SET "id" = 'd1000000-0000-4000-8000-00000000000a' WHERE "id" = 'd1000000-0000-4000-8000-0000000a';
UPDATE "engineering_discipline" SET "id" = 'd1000000-0000-4000-8000-00000000000b' WHERE "id" = 'd1000000-0000-4000-8000-0000000b';
UPDATE "engineering_discipline" SET "id" = 'd1000000-0000-4000-8000-00000000000c' WHERE "id" = 'd1000000-0000-4000-8000-0000000c';
UPDATE "engineering_discipline" SET "id" = 'd1000000-0000-4000-8000-00000000000d' WHERE "id" = 'd1000000-0000-4000-8000-0000000d';
UPDATE "engineering_discipline" SET "id" = 'd1000000-0000-4000-8000-000000000101' WHERE "id" = 'd1000000-0000-4000-8000-00000101';
UPDATE "engineering_discipline" SET "id" = 'd1000000-0000-4000-8000-000000000102' WHERE "id" = 'd1000000-0000-4000-8000-00000102';
UPDATE "engineering_discipline" SET "id" = 'd1000000-0000-4000-8000-000000000103' WHERE "id" = 'd1000000-0000-4000-8000-00000103';
UPDATE "engineering_discipline" SET "id" = 'd1000000-0000-4000-8000-000000000104' WHERE "id" = 'd1000000-0000-4000-8000-00000104';
