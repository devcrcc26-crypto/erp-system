/**
 * Project responsible department - backend source of truth; keys must match Prisma enum.
 */
export const PROJECT_RESPONSIBLE_DEPARTMENT_VALUES = [
  'MUNICIPAL_TRANSPORTATION_DEPARTMENT',
  'ARCHITECTURAL_DESIGN_DEPARTMENT',
] as const;

export type ProjectResponsibleDepartment =
  (typeof PROJECT_RESPONSIBLE_DEPARTMENT_VALUES)[number];

export interface ProjectResponsibleDepartmentDefinition {
  value: ProjectResponsibleDepartment;
  label: string;
}

export const PROJECT_RESPONSIBLE_DEPARTMENT_DEFINITIONS: readonly ProjectResponsibleDepartmentDefinition[] =
  [
    {
      value: 'MUNICIPAL_TRANSPORTATION_DEPARTMENT',
      label: 'Municipal Transportation Department',
    },
    {
      value: 'ARCHITECTURAL_DESIGN_DEPARTMENT',
      label: 'Architectural Design Department',
    },
  ] as const;

export const PROJECT_RESPONSIBLE_DEPARTMENT_DEFAULT: ProjectResponsibleDepartment =
  'MUNICIPAL_TRANSPORTATION_DEPARTMENT';

const PROJECT_RESPONSIBLE_DEPARTMENT_LABELS: Record<
  ProjectResponsibleDepartment,
  string
> = PROJECT_RESPONSIBLE_DEPARTMENT_DEFINITIONS.reduce(
  (accumulator, definition) => {
    accumulator[definition.value] = definition.label;
    return accumulator;
  },
  {} as Record<ProjectResponsibleDepartment, string>,
);

/** Human-readable label for a project responsible department key. */
export function formatProjectResponsibleDepartmentLabel(
  value: ProjectResponsibleDepartment | string,
): string {
  return (
    PROJECT_RESPONSIBLE_DEPARTMENT_LABELS[
      value as ProjectResponsibleDepartment
    ] ?? value
  );
}

export const PROJECT_RESPONSIBLE_DEPARTMENT_OPTIONS =
  PROJECT_RESPONSIBLE_DEPARTMENT_DEFINITIONS.map((definition) => ({
    value: definition.value,
    label: definition.label,
  }));

export type ProjectResponsibleDepartmentBadgeVariant = 'info' | 'default';

export function projectResponsibleDepartmentBadgeVariant(
  value: ProjectResponsibleDepartment,
): ProjectResponsibleDepartmentBadgeVariant {
  if (value === 'ARCHITECTURAL_DESIGN_DEPARTMENT') {
    return 'default';
  }
  return 'info';
}
