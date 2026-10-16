/**
 * Project status - backend source of truth; keys must match Prisma ProjectStatus enum.
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

/** Maps legacy enum values to the current set (for migrations and seed fixes). */
export const LEGACY_PROJECT_STATUS_MAP: Record<string, ProjectStatus> = {
  PLANNING: 'NOT_STARTED',
  TENDER: 'NOT_STARTED',
  MOBILIZATION: 'IN_PROGRESS',
  ACTIVE: 'IN_PROGRESS',
  ON_HOLD: 'ON_HOLD',
  COMPLETED: 'COMPLETED',
  CLOSED: 'COMPLETED',
};

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

/** Human-readable label for a project status key. */
export function formatProjectStatusLabel(
  status: ProjectStatus | string,
): string {
  return PROJECT_STATUS_LABELS[status as ProjectStatus] ?? status;
}

/** Badge color variant for a project status key. */
export function projectStatusBadgeVariant(
  status: ProjectStatus,
): ProjectStatusBadgeVariant {
  return PROJECT_STATUS_VARIANTS[status];
}

/** Allowed status transitions keyed by current status. */
export const PROJECT_STATUS_TRANSITIONS: Record<
  ProjectStatus,
  readonly ProjectStatus[]
> = {
  NOT_STARTED: ['IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
  IN_PROGRESS: ['ON_HOLD', 'COMPLETED', 'CANCELLED'],
  ON_HOLD: ['NOT_STARTED', 'IN_PROGRESS', 'CANCELLED'],
  CANCELLED: [],
  COMPLETED: [],
};
