import type { ProjectResponsibleDepartment } from '@/lib/constants/project-responsible-department';
import { PROJECT_RESPONSIBLE_DEPARTMENT_DEFINITIONS } from '@/lib/constants/project-responsible-department';
import type { Project } from '@/lib/api/project-management.types';
import type { DepartmentRow } from '@/lib/query/org';

/** Maps legacy HR department codes to project responsible-department enum values. */
const DEPARTMENT_CODE_TO_RESPONSIBLE: Record<string, ProjectResponsibleDepartment> =
  {
    MTD: 'MUNICIPAL_TRANSPORTATION_DEPARTMENT',
    ADD: 'ARCHITECTURAL_DESIGN_DEPARTMENT',
  };

const DEPARTMENT_NAME_TO_RESPONSIBLE: Record<string, ProjectResponsibleDepartment> =
  PROJECT_RESPONSIBLE_DEPARTMENT_DEFINITIONS.reduce(
    (accumulator, definition) => {
      accumulator[definition.label.toUpperCase()] = definition.value;
      return accumulator;
    },
    {} as Record<string, ProjectResponsibleDepartment>,
  );

/**
 * Returns true when a project belongs to the given HR department row.
 */
export function projectBelongsToDepartment(
  project: Project & { departmentId?: string | null },
  department: Pick<DepartmentRow, 'id' | 'code'> & { name?: string },
): boolean {
  if (project.departmentId) {
    return project.departmentId === department.id;
  }
  const mapped =
    DEPARTMENT_CODE_TO_RESPONSIBLE[department.code.toUpperCase()] ??
    (department.name
      ? DEPARTMENT_NAME_TO_RESPONSIBLE[department.name.trim().toUpperCase()]
      : undefined);
  return mapped ? project.responsibleDepartment === mapped : false;
}

/**
 * Filters projects that belong to one or more department rows.
 */
export function filterProjectsForDepartments(
  projects: Array<Project & { departmentId?: string | null }>,
  departments: Array<Pick<DepartmentRow, 'id' | 'code'> & { name?: string }>,
): Array<Project & { departmentId?: string | null }> {
  if (departments.length === 0) {
    return [];
  }
  return projects.filter((project) =>
    departments.some((department) => projectBelongsToDepartment(project, department)),
  );
}
