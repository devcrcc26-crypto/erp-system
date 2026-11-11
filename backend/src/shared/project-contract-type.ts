/**
 * Project contract type - backend source of truth; keys must match Prisma ProjectContractType enum.
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

/** Maps legacy free-text values to the current enum set (migrations/seeds). */
export const LEGACY_PROJECT_CONTRACT_TYPE_MAP: Record<
  string,
  ProjectContractType
> = {
  LUMP_SUM: 'CONTRACT',
  COST_PLUS: 'CONTRACT',
  UNIT_PRICE: 'CONTRACT',
  'Lump sum': 'CONTRACT',
  'LUMP SUM': 'CONTRACT',
  Contract: 'CONTRACT',
  CONTRACT: 'CONTRACT',
  'Email commission': 'EMAIL',
  Email: 'EMAIL',
  EMAIL: 'EMAIL',
  'Informal Assignment': 'INFORMAL_ASSIGNMENT',
  INFORMAL: 'INFORMAL_ASSIGNMENT',
  'No Assignment': 'NO_ASSIGNMENT',
  NONE: 'NO_ASSIGNMENT',
  NO_ASSIGNMENT: 'NO_ASSIGNMENT',
};

const PROJECT_CONTRACT_TYPE_LABELS: Record<ProjectContractType, string> =
  PROJECT_CONTRACT_TYPE_DEFINITIONS.reduce(
    (accumulator, definition) => {
      accumulator[definition.value] = definition.label;
      return accumulator;
    },
    {} as Record<ProjectContractType, string>,
  );

/** Human-readable label for a project contract type key. */
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
