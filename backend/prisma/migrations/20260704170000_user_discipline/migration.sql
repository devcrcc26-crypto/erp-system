-- Add optional engineering discipline to users.

CREATE TYPE "UserDiscipline" AS ENUM (
  'HIGHWAY',
  'HYDROLOGY',
  'STRUCTURE_ROAD',
  'GEOLOGICAL',
  'PAVEMENT_MATERIAL',
  'SURVEY',
  'ARCHITECTURE',
  'INTERIOR_DESIGN',
  'LANDSCAPE_DESIGN',
  'STRUCTURE_BUILDING',
  'SANITARY',
  'ELECTRICAL_ICT',
  'MECHANICAL'
);

ALTER TABLE "user"
  ADD COLUMN "discipline" "UserDiscipline";

CREATE INDEX "idx_user_discipline" ON "user" ("discipline");
