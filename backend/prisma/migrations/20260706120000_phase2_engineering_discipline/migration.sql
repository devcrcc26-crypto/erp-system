-- PHASE 2: Engineering discipline catalog + FK on task_discipline and user
-- Merge map applied (live data):
--   Architecture -> Architecture
--   Civil -> Civil (custom)
--   Hydrology -> Hydrology
--   MEP, MEP Coordination -> MEP (custom)
--   Pavement/Material -> Pavement/Material
--   Podium Envelope -> Podium Envelope (custom)
--   Steel Connections -> Structure(Road)
--   Structural, Structural Systems -> Structure(Building)
--   Structure(Road) -> Structure(Road)
--   Tower Crown -> Tower Crown (custom)
-- User.discipline enum: 143 null rows - no user backfill
-- Rollback:
--   UPDATE task_discipline SET discipline_id = NULL;
--   UPDATE "user" SET engineering_discipline_id = NULL;
--   ALTER TABLE task_discipline DROP COLUMN discipline_id;
--   ALTER TABLE "user" DROP COLUMN engineering_discipline_id;
--   DROP TABLE engineering_discipline;

CREATE TABLE IF NOT EXISTS "engineering_discipline" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "name_zh" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" TEXT NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "updated_by" TEXT NOT NULL,
  "deleted_at" TIMESTAMP(3),
  "deleted_by" TEXT,
  CONSTRAINT "engineering_discipline_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_engineering_discipline_company_name"
  ON "engineering_discipline"("company_id", "name");
CREATE INDEX IF NOT EXISTS "idx_engineering_discipline_company_id"
  ON "engineering_discipline"("company_id");
CREATE INDEX IF NOT EXISTS "idx_engineering_discipline_company_deleted"
  ON "engineering_discipline"("company_id", "deleted_at");
CREATE INDEX IF NOT EXISTS "idx_engineering_discipline_company_active"
  ON "engineering_discipline"("company_id", "is_active");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'engineering_discipline_company_id_fkey'
  ) THEN
    ALTER TABLE "engineering_discipline"
      ADD CONSTRAINT "engineering_discipline_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "company"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Standard 13 + 4 project-specific customs (skip when seed company is absent)
INSERT INTO "engineering_discipline" (
  "id", "company_id", "name", "name_zh", "is_active",
  "created_at", "created_by", "updated_at", "updated_by"
)
SELECT v."id", v."company_id", v."name", v."name_zh", v."is_active",
       v."created_at", v."created_by", v."updated_at", v."updated_by"
FROM (
  VALUES
    ('d1000000-0000-4000-8000-00000001', '00000000-0000-4000-8000-000000000001', 'Highway', '公路', true, NOW(), '00000000-0000-4000-8000-000000000001', NOW(), '00000000-0000-4000-8000-000000000001'),
    ('d1000000-0000-4000-8000-00000002', '00000000-0000-4000-8000-000000000001', 'Hydrology', '水文', true, NOW(), '00000000-0000-4000-8000-000000000001', NOW(), '00000000-0000-4000-8000-000000000001'),
    ('d1000000-0000-4000-8000-00000003', '00000000-0000-4000-8000-000000000001', 'Structure(Road)', '结构(道路)', true, NOW(), '00000000-0000-4000-8000-000000000001', NOW(), '00000000-0000-4000-8000-000000000001'),
    ('d1000000-0000-4000-8000-00000004', '00000000-0000-4000-8000-000000000001', 'Geological', '地质', true, NOW(), '00000000-0000-4000-8000-000000000001', NOW(), '00000000-0000-4000-8000-000000000001'),
    ('d1000000-0000-4000-8000-00000005', '00000000-0000-4000-8000-000000000001', 'Pavement/Material', '路面/材料', true, NOW(), '00000000-0000-4000-8000-000000000001', NOW(), '00000000-0000-4000-8000-000000000001'),
    ('d1000000-0000-4000-8000-00000006', '00000000-0000-4000-8000-000000000001', 'Survey', '测量', true, NOW(), '00000000-0000-4000-8000-000000000001', NOW(), '00000000-0000-4000-8000-000000000001'),
    ('d1000000-0000-4000-8000-00000007', '00000000-0000-4000-8000-000000000001', 'Architecture', '建筑', true, NOW(), '00000000-0000-4000-8000-000000000001', NOW(), '00000000-0000-4000-8000-000000000001'),
    ('d1000000-0000-4000-8000-00000008', '00000000-0000-4000-8000-000000000001', 'Interior Design', '室内设计', true, NOW(), '00000000-0000-4000-8000-000000000001', NOW(), '00000000-0000-4000-8000-000000000001'),
    ('d1000000-0000-4000-8000-00000009', '00000000-0000-4000-8000-000000000001', 'Landscape Design', '景观设计', true, NOW(), '00000000-0000-4000-8000-000000000001', NOW(), '00000000-0000-4000-8000-000000000001'),
    ('d1000000-0000-4000-8000-0000000a', '00000000-0000-4000-8000-000000000001', 'Structure(Building)', '结构(建筑)', true, NOW(), '00000000-0000-4000-8000-000000000001', NOW(), '00000000-0000-4000-8000-000000000001'),
    ('d1000000-0000-4000-8000-0000000b', '00000000-0000-4000-8000-000000000001', 'Sanitary', '给排水', true, NOW(), '00000000-0000-4000-8000-000000000001', NOW(), '00000000-0000-4000-8000-000000000001'),
    ('d1000000-0000-4000-8000-0000000c', '00000000-0000-4000-8000-000000000001', 'Electrical&ICT', '电气&ICT', true, NOW(), '00000000-0000-4000-8000-000000000001', NOW(), '00000000-0000-4000-8000-000000000001'),
    ('d1000000-0000-4000-8000-0000000d', '00000000-0000-4000-8000-000000000001', 'Mechanical', '暖通', true, NOW(), '00000000-0000-4000-8000-000000000001', NOW(), '00000000-0000-4000-8000-000000000001'),
    ('d1000000-0000-4000-8000-00000101', '00000000-0000-4000-8000-000000000001', 'Civil', '土建', true, NOW(), '00000000-0000-4000-8000-000000000001', NOW(), '00000000-0000-4000-8000-000000000001'),
    ('d1000000-0000-4000-8000-00000102', '00000000-0000-4000-8000-000000000001', 'MEP', '机电', true, NOW(), '00000000-0000-4000-8000-000000000001', NOW(), '00000000-0000-4000-8000-000000000001'),
    ('d1000000-0000-4000-8000-00000103', '00000000-0000-4000-8000-000000000001', 'Podium Envelope', '裙楼围护', true, NOW(), '00000000-0000-4000-8000-000000000001', NOW(), '00000000-0000-4000-8000-000000000001'),
    ('d1000000-0000-4000-8000-00000104', '00000000-0000-4000-8000-000000000001', 'Tower Crown', '塔冠', true, NOW(), '00000000-0000-4000-8000-000000000001', NOW(), '00000000-0000-4000-8000-000000000001')
) AS v("id", "company_id", "name", "name_zh", "is_active", "created_at", "created_by", "updated_at", "updated_by")
WHERE EXISTS (
  SELECT 1 FROM "company" c WHERE c."id" = '00000000-0000-4000-8000-000000000001'
)
ON CONFLICT ("company_id", "name") DO UPDATE SET
  "name_zh" = EXCLUDED."name_zh",
  "updated_at" = NOW();

ALTER TABLE "task_discipline"
  ADD COLUMN IF NOT EXISTS "discipline_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'task_discipline_discipline_id_fkey'
  ) THEN
    ALTER TABLE "task_discipline"
      ADD CONSTRAINT "task_discipline_discipline_id_fkey"
      FOREIGN KEY ("discipline_id") REFERENCES "engineering_discipline"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_task_discipline_discipline_id"
  ON "task_discipline"("discipline_id");

UPDATE "task_discipline" SET "discipline_id" = 'd1000000-0000-4000-8000-00000007' WHERE "discipline_name" = 'Architecture' AND "deleted_at" IS NULL;
UPDATE "task_discipline" SET "discipline_id" = 'd1000000-0000-4000-8000-00000101' WHERE "discipline_name" = 'Civil' AND "deleted_at" IS NULL;
UPDATE "task_discipline" SET "discipline_id" = 'd1000000-0000-4000-8000-00000002' WHERE "discipline_name" = 'Hydrology' AND "deleted_at" IS NULL;
UPDATE "task_discipline" SET "discipline_id" = 'd1000000-0000-4000-8000-00000102' WHERE "discipline_name" IN ('MEP', 'MEP Coordination') AND "deleted_at" IS NULL;
UPDATE "task_discipline" SET "discipline_id" = 'd1000000-0000-4000-8000-00000005' WHERE "discipline_name" = 'Pavement/Material' AND "deleted_at" IS NULL;
UPDATE "task_discipline" SET "discipline_id" = 'd1000000-0000-4000-8000-00000103' WHERE "discipline_name" = 'Podium Envelope' AND "deleted_at" IS NULL;
UPDATE "task_discipline" SET "discipline_id" = 'd1000000-0000-4000-8000-00000003' WHERE "discipline_name" = 'Steel Connections' AND "deleted_at" IS NULL;
UPDATE "task_discipline" SET "discipline_id" = 'd1000000-0000-4000-8000-0000000a' WHERE "discipline_name" IN ('Structural', 'Structural Systems') AND "deleted_at" IS NULL;
UPDATE "task_discipline" SET "discipline_id" = 'd1000000-0000-4000-8000-00000003' WHERE "discipline_name" = 'Structure(Road)' AND "deleted_at" IS NULL;
UPDATE "task_discipline" SET "discipline_id" = 'd1000000-0000-4000-8000-00000104' WHERE "discipline_name" = 'Tower Crown' AND "deleted_at" IS NULL;

ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "engineering_discipline_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_engineering_discipline_id_fkey'
  ) THEN
    ALTER TABLE "user"
      ADD CONSTRAINT "user_engineering_discipline_id_fkey"
      FOREIGN KEY ("engineering_discipline_id") REFERENCES "engineering_discipline"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_user_engineering_discipline_id"
  ON "user"("engineering_discipline_id");

-- Backfill user enum -> FK where set (0 rows in production today)
UPDATE "user" u SET "engineering_discipline_id" = ed."id"
FROM "engineering_discipline" ed
WHERE u."deleted_at" IS NULL
  AND u."discipline" IS NOT NULL
  AND u."engineering_discipline_id" IS NULL
  AND ed."company_id" = u."company_id"
  AND ed."deleted_at" IS NULL
  AND (
    (u."discipline" = 'HIGHWAY' AND ed."name" = 'Highway') OR
    (u."discipline" = 'HYDROLOGY' AND ed."name" = 'Hydrology') OR
    (u."discipline" = 'STRUCTURE_ROAD' AND ed."name" = 'Structure(Road)') OR
    (u."discipline" = 'GEOLOGICAL' AND ed."name" = 'Geological') OR
    (u."discipline" = 'PAVEMENT_MATERIAL' AND ed."name" = 'Pavement/Material') OR
    (u."discipline" = 'SURVEY' AND ed."name" = 'Survey') OR
    (u."discipline" = 'ARCHITECTURE' AND ed."name" = 'Architecture') OR
    (u."discipline" = 'INTERIOR_DESIGN' AND ed."name" = 'Interior Design') OR
    (u."discipline" = 'LANDSCAPE_DESIGN' AND ed."name" = 'Landscape Design') OR
    (u."discipline" = 'STRUCTURE_BUILDING' AND ed."name" = 'Structure(Building)') OR
    (u."discipline" = 'SANITARY' AND ed."name" = 'Sanitary') OR
    (u."discipline" = 'ELECTRICAL_ICT' AND ed."name" = 'Electrical&ICT') OR
    (u."discipline" = 'MECHANICAL' AND ed."name" = 'Mechanical')
  );
