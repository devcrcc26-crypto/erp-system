import type { ProjectResponsibleDepartment } from '@/lib/constants/project-responsible-department';
import type { Project } from '@/lib/api/project-management.types';
import type { DepartmentRow } from '@/lib/query/org';

/** Maps HR department codes to legacy project responsible-department enum values. */
const DEPARTMENT_CODE_TO_RESPONSIBLE: Record<string, ProjectResponsibleDepartment> =
  {
    MTD: 'MUNICIPAL_TRANSPORTATION_DEPARTMENT',
    ADD: 'ARCHITECTURAL_DESIGN_DEPARTMENT',
  };

/**
 * Returns true when a project belongs to the given HR department row.
 */
export function projectBelongsToDepartment(
  project: Project & { departmentId?: string | null },
  department: Pick<DepartmentRow, 'id' | 'code'>,
): boolean {
  if (project.departmentId) {
    return project.departmentId === department.id;
  }
  const mapped = DEPARTMENT_CODE_TO_RESPONSIBLE[department.code.toUpperCase()];
  return mapped ? project.responsibleDepartment === mapped : false;
}

/**
 * Filters projects that belong to one or more department rows.
 */
export function filterProjectsForDepartments(
  projects: Array<Project & { departmentId?: string | null }>,
  departments: Array<Pick<DepartmentRow, 'id' | 'code'>>,
): Array<Project & { departmentId?: string | null }> {
  if (departments.length === 0) {
    return [];
  }
  return projects.filter((project) =>
    departments.some((department) => projectBelongsToDepartment(project, department)),
  );
}
