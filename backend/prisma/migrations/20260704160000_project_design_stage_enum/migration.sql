-- Migrate project.design_stage and task.design_stage to ProjectDesignStage (8 values only).

UPDATE "project"
SET "design_stage" = CASE
  WHEN "design_stage" IS NULL OR TRIM("design_stage") = '' THEN 'TENDER'
  WHEN "design_stage" IN (
    'TENDER',
    'CONCEPT_DESIGN_CD',
    'PRELIMINARY_DESIGN_PD',
    'SCHEMATIC_DESIGN_SD',
    'DETAILED_DESIGN_DD',
    'CONSTRUCTION_DRAWING_DESIGN_CD_IFC',
    'CONSTRUCTION_SUPPORT',
    'AS_BUILT_DRAWINGS'
  ) THEN "design_stage"
  WHEN "design_stage" IN ('INITIATION', 'PLANNING') THEN 'TENDER'
  WHEN "design_stage" = 'CONCEPT_DESIGN' THEN 'CONCEPT_DESIGN_CD'
  WHEN "design_stage" = 'SCHEMATIC' THEN 'SCHEMATIC_DESIGN_SD'
  WHEN "design_stage" = 'DETAILED_DESIGN' THEN 'DETAILED_DESIGN_DD'
  WHEN "design_stage" IN ('IFC', 'SUBMITTAL') THEN 'CONSTRUCTION_DRAWING_DESIGN_CD_IFC'
  WHEN "design_stage" = 'CONSTRUCTION_SUPPORT' THEN 'CONSTRUCTION_SUPPORT'
  WHEN "design_stage" = 'CLOSEOUT' THEN 'AS_BUILT_DRAWINGS'
  WHEN LOWER(TRIM("design_stage")) IN ('tender', 'feasibility') THEN 'TENDER'
  WHEN LOWER("design_stage") LIKE '%concept design%' THEN 'CONCEPT_DESIGN_CD'
  WHEN LOWER("design_stage") LIKE '%preliminary design%' THEN 'PRELIMINARY_DESIGN_PD'
  WHEN LOWER("design_stage") LIKE '%schematic%' OR LOWER("design_stage") LIKE '%scheme design%' THEN 'SCHEMATIC_DESIGN_SD'
  WHEN LOWER("design_stage") LIKE '%detailed design%' THEN 'DETAILED_DESIGN_DD'
  WHEN LOWER("design_stage") LIKE '%construction document%' OR LOWER("design_stage") LIKE '%cd/ifc%' THEN 'CONSTRUCTION_DRAWING_DESIGN_CD_IFC'
  WHEN LOWER("design_stage") LIKE '%construction support%' OR LOWER(TRIM("design_stage")) = 'construction' THEN 'CONSTRUCTION_SUPPORT'
  WHEN LOWER("design_stage") LIKE '%as-built%' OR LOWER("design_stage") LIKE '%as built%' OR LOWER(TRIM("design_stage")) = 'closeout' THEN 'AS_BUILT_DRAWINGS'
  ELSE 'TENDER'
END;

UPDATE "task"
SET "design_stage" = CASE
  WHEN "design_stage" IS NULL OR TRIM("design_stage") = '' THEN NULL
  WHEN "design_stage" IN (
    'TENDER',
    'CONCEPT_DESIGN_CD',
    'PRELIMINARY_DESIGN_PD',
    'SCHEMATIC_DESIGN_SD',
    'DETAILED_DESIGN_DD',
    'CONSTRUCTION_DRAWING_DESIGN_CD_IFC',
    'CONSTRUCTION_SUPPORT',
    'AS_BUILT_DRAWINGS'
  ) THEN "design_stage"
  WHEN "design_stage" IN ('INITIATION', 'PLANNING') THEN 'TENDER'
  WHEN "design_stage" = 'CONCEPT_DESIGN' THEN 'CONCEPT_DESIGN_CD'
  WHEN "design_stage" = 'SCHEMATIC' THEN 'SCHEMATIC_DESIGN_SD'
  WHEN "design_stage" = 'DETAILED_DESIGN' THEN 'DETAILED_DESIGN_DD'
  WHEN "design_stage" IN ('IFC', 'SUBMITTAL') THEN 'CONSTRUCTION_DRAWING_DESIGN_CD_IFC'
  WHEN "design_stage" = 'CONSTRUCTION_SUPPORT' THEN 'CONSTRUCTION_SUPPORT'
  WHEN "design_stage" = 'CLOSEOUT' THEN 'AS_BUILT_DRAWINGS'
  WHEN LOWER(TRIM("design_stage")) IN ('tender', 'feasibility') THEN 'TENDER'
  WHEN LOWER("design_stage") LIKE '%concept design%' THEN 'CONCEPT_DESIGN_CD'
  WHEN LOWER("design_stage") LIKE '%preliminary design%' THEN 'PRELIMINARY_DESIGN_PD'
  WHEN LOWER("design_stage") LIKE '%schematic%' OR LOWER("design_stage") LIKE '%scheme design%' THEN 'SCHEMATIC_DESIGN_SD'
  WHEN LOWER("design_stage") LIKE '%detailed design%' THEN 'DETAILED_DESIGN_DD'
  WHEN LOWER("design_stage") LIKE '%construction document%' OR LOWER("design_stage") LIKE '%cd/ifc%' THEN 'CONSTRUCTION_DRAWING_DESIGN_CD_IFC'
  WHEN LOWER("design_stage") LIKE '%construction support%' OR LOWER(TRIM("design_stage")) = 'construction' THEN 'CONSTRUCTION_SUPPORT'
  WHEN LOWER("design_stage") LIKE '%as-built%' OR LOWER("design_stage") LIKE '%as built%' OR LOWER(TRIM("design_stage")) = 'closeout' THEN 'AS_BUILT_DRAWINGS'
  ELSE NULL
END
WHERE "design_stage" IS NOT NULL;

CREATE TYPE "ProjectDesignStage" AS ENUM (
  'TENDER',
  'CONCEPT_DESIGN_CD',
  'PRELIMINARY_DESIGN_PD',
  'SCHEMATIC_DESIGN_SD',
  'DETAILED_DESIGN_DD',
  'CONSTRUCTION_DRAWING_DESIGN_CD_IFC',
  'CONSTRUCTION_SUPPORT',
  'AS_BUILT_DRAWINGS'
);

ALTER TABLE "project"
  ALTER COLUMN "design_stage" TYPE "ProjectDesignStage"
  USING "design_stage"::"ProjectDesignStage";

ALTER TABLE "project"
  ALTER COLUMN "design_stage" SET NOT NULL;

ALTER TABLE "project"
  ALTER COLUMN "design_stage" SET DEFAULT 'TENDER';

ALTER TABLE "task"
  ALTER COLUMN "design_stage" TYPE "ProjectDesignStage"
  USING "design_stage"::"ProjectDesignStage";
