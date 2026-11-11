/**
 * Project status values and labels - must match backend ProjectStatus enum keys.
 */
export const PROJECT_STATUS_VALUES = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'ON_HOLD',
  'CANCELLED',
  'COMPLETED',
] as const;

export type ProjectStatus = (typeof PROJECT_STATUS_VALUES)[number];

export interface ProjectStatusDefinition {
  value: ProjectStatus;
  label: string;
}

export const PROJECT_STATUS_DEFINITIONS: readonly ProjectStatusDefinition[] = [
  { value: 'NOT_STARTED', label: 'Not Started' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'ON_HOLD', label: 'On Hold' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'COMPLETED', label: 'Completed' },
] as const;

export const PROJECT_STATUS_DEFAULT: ProjectStatus = 'NOT_STARTED';

export type ProjectStatusBadgeVariant =
  | 'default'
  | 'info'
  | 'success'
  | 'warning'
  | 'error'
  | 'orange';

const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> =
  PROJECT_STATUS_DEFINITIONS.reduce(
    (accumulator, definition) => {
      accumulator[definition.value] = definition.label;
      return accumulator;
    },
    {} as Record<ProjectStatus, string>,
  );

const PROJECT_STATUS_VARIANTS: Record<ProjectStatus, ProjectStatusBadgeVariant> =
  {
    NOT_STARTED: 'info',
    IN_PROGRESS: 'success',
    ON_HOLD: 'warning',
    CANCELLED: 'error',
    COMPLETED: 'success',
  };

export function formatProjectStatusLabel(
  status: ProjectStatus | string,
): string {
  return PROJECT_STATUS_LABELS[status as ProjectStatus] ?? status;
}

export function projectStatusBadgeVariant(
  status: ProjectStatus,
): ProjectStatusBadgeVariant {
  return PROJECT_STATUS_VARIANTS[status];
}

export const PROJECT_STATUS_OPTIONS = PROJECT_STATUS_DEFINITIONS.map(
  (definition) => ({
    value: definition.value,
    label: definition.label,
  }),
);
