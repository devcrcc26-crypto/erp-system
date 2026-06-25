import type { ProjectDesignPhase } from '@/lib/api/project-management.types';

export const PROJECT_DESIGN_PHASE_OPTIONS: Array<{
  value: ProjectDesignPhase;
  label: string;
}> = [
  { value: 'INITIATION', label: 'Initiation' },
  { value: 'PLANNING', label: 'Planning' },
  { value: 'CONCEPT_DESIGN', label: 'Concept design' },
  { value: 'SCHEMATIC', label: 'Schematic' },
  { value: 'DETAILED_DESIGN', label: 'Detailed design' },
  { value: 'IFC', label: 'IFC (issued for construction)' },
  { value: 'SUBMITTAL', label: 'Submittal' },
  { value: 'CONSTRUCTION_SUPPORT', label: 'Construction support' },
  { value: 'CLOSEOUT', label: 'Closeout' },
];

/**
 * Returns a display label for a project design phase value.
 */
export function formatProjectDesignPhase(
  phase: ProjectDesignPhase | string | null | undefined,
): string {
  if (!phase) {
    return '-';
  }
  const match = PROJECT_DESIGN_PHASE_OPTIONS.find((option) => option.value === phase);
  return match?.label ?? phase;
}
