/**
 * Project contract type values and labels - must match backend ProjectContractType enum keys.
 */
export const PROJECT_CONTRACT_TYPE_VALUES = [
  'CONTRACT',
  'EMAIL',
  'INFORMAL_ASSIGNMENT',
  'NO_ASSIGNMENT',
] as const;

export type ProjectContractType =
  (typeof PROJECT_CONTRACT_TYPE_VALUES)[number];

export interface ProjectContractTypeDefinition {
  value: ProjectContractType;
  label: string;
}

export const PROJECT_CONTRACT_TYPE_DEFINITIONS: readonly ProjectContractTypeDefinition[] =
  [
    { value: 'CONTRACT', label: 'Contract' },
    { value: 'EMAIL', label: 'Email' },
    { value: 'INFORMAL_ASSIGNMENT', label: 'Informal Assignment' },
    { value: 'NO_ASSIGNMENT', label: 'No Assignment' },
  ] as const;

export const PROJECT_CONTRACT_TYPE_DEFAULT: ProjectContractType =
  'NO_ASSIGNMENT';

const PROJECT_CONTRACT_TYPE_LABELS: Record<ProjectContractType, string> =
  PROJECT_CONTRACT_TYPE_DEFINITIONS.reduce(
    (accumulator, definition) => {
      accumulator[definition.value] = definition.label;
      return accumulator;
    },
    {} as Record<ProjectContractType, string>,
  );

export function formatProjectContractTypeLabel(
  value: ProjectContractType | string,
): string {
  return PROJECT_CONTRACT_TYPE_LABELS[value as ProjectContractType] ?? value;
}

export const PROJECT_CONTRACT_TYPE_OPTIONS =
  PROJECT_CONTRACT_TYPE_DEFINITIONS.map((definition) => ({
    value: definition.value,
    label: definition.label,
  }));
