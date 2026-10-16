/**
 * Project design stage - backend source of truth; keys must match Prisma enum.
 */
export const PROJECT_DESIGN_STAGE_VALUES = [
  'TENDER',
  'CONCEPT_DESIGN_CD',
  'PRELIMINARY_DESIGN_PD',
  'SCHEMATIC_DESIGN_SD',
  'DETAILED_DESIGN_DD',
  'CONSTRUCTION_DRAWING_DESIGN_CD_IFC',
  'CONSTRUCTION_SUPPORT',
  'AS_BUILT_DRAWINGS',
] as const;

export type ProjectDesignStage =
  (typeof PROJECT_DESIGN_STAGE_VALUES)[number];

export interface ProjectDesignStageDefinition {
  value: ProjectDesignStage;
  label: string;
}

export const PROJECT_DESIGN_STAGE_DEFINITIONS: readonly ProjectDesignStageDefinition[] =
  [
    { value: 'TENDER', label: 'Tender' },
    { value: 'CONCEPT_DESIGN_CD', label: 'Concept Design (CD)' },
    { value: 'PRELIMINARY_DESIGN_PD', label: 'Preliminary Design (PD)' },
    { value: 'SCHEMATIC_DESIGN_SD', label: 'Schematic Design (SD)' },
    { value: 'DETAILED_DESIGN_DD', label: 'Detailed Design (DD)' },
    {
      value: 'CONSTRUCTION_DRAWING_DESIGN_CD_IFC',
      label: 'Construction Drawing Design(CD/IFC)',
    },
    { value: 'CONSTRUCTION_SUPPORT', label: 'Construction Support' },
    { value: 'AS_BUILT_DRAWINGS', label: 'As-Built Drawings' },
  ] as const;

export const PROJECT_DESIGN_STAGE_DEFAULT: ProjectDesignStage = 'TENDER';

const PROJECT_DESIGN_STAGE_LABELS: Record<ProjectDesignStage, string> =
  PROJECT_DESIGN_STAGE_DEFINITIONS.reduce(
    (accumulator, definition) => {
      accumulator[definition.value] = definition.label;
      return accumulator;
    },
    {} as Record<ProjectDesignStage, string>,
  );

/** Human-readable label for a project design stage key. */
export function formatProjectDesignStageLabel(
  value: ProjectDesignStage | string,
): string {
  return PROJECT_DESIGN_STAGE_LABELS[value as ProjectDesignStage] ?? value;
}

export const PROJECT_DESIGN_STAGE_OPTIONS =
  PROJECT_DESIGN_STAGE_DEFINITIONS.map((definition) => ({
    value: definition.value,
    label: definition.label,
  }));

export type ProjectDesignStageBadgeVariant =
  | 'default'
  | 'info'
  | 'orange'
  | 'success'
  | 'warning';

export function projectDesignStageBadgeVariant(
  value: ProjectDesignStage,
): ProjectDesignStageBadgeVariant {
  switch (value) {
    case 'TENDER':
      return 'default';
    case 'CONCEPT_DESIGN_CD':
    case 'PRELIMINARY_DESIGN_PD':
      return 'info';
    case 'SCHEMATIC_DESIGN_SD':
    case 'DETAILED_DESIGN_DD':
      return 'orange';
    case 'CONSTRUCTION_DRAWING_DESIGN_CD_IFC':
      return 'warning';
    case 'CONSTRUCTION_SUPPORT':
      return 'success';
    case 'AS_BUILT_DRAWINGS':
      return 'default';
    default:
      return 'default';
  }
}
