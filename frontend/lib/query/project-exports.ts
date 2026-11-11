import { downloadApiFile } from '@/lib/api/client';
import type { ProjectListFilters } from '@/lib/api/project-management.types';
import { projectPath } from '@/lib/query/pm-query-utils';

type ProjectExportFilters = Pick<
  ProjectListFilters,
  | 'search'
  | 'status'
  | 'projectType'
  | 'responsibleDepartment'
  | 'designProperties'
  | 'designStage'
>;

/**
 * Downloads the bilingual project list Excel export for the current company.
 */
export async function downloadProjectListExcel(
  filters: ProjectExportFilters = {},
): Promise<void> {
  const search = new URLSearchParams();
  if (filters.search) {
    search.set('search', filters.search);
  }
  if (filters.status) {
    search.set('status', filters.status);
  }
  if (filters.projectType) {
    search.set('projectType', filters.projectType);
  }
  if (filters.responsibleDepartment) {
    search.set('responsibleDepartment', filters.responsibleDepartment);
  }
  if (filters.designProperties) {
    search.set('designProperties', filters.designProperties);
  }
  if (filters.designStage) {
    search.set('designStage', filters.designStage);
  }
  const query = search.toString();
  await downloadApiFile(
    `/projects/export/project-list${query ? `?${query}` : ''}`,
    'project-list.xlsx',
  );
}

/**
 * Downloads the bilingual task list Excel export for a single project.
 */
export async function downloadTaskListExcel(projectId: string): Promise<void> {
  await downloadApiFile(
    `${projectPath(projectId)}/schedule/export/task-list`,
    'task-list.xlsx',
  );
}

/**
 * Downloads the task list Excel export limited to the 17 standard task
 * columns (Overseas Task Number through Task Supervising Company Chief
 * Engineer / Department Chief Engineer) - no disciplines or trailing
 * change-request/commercial columns.
 */
export async function downloadTaskListSummaryExcel(
  projectId: string,
): Promise<void> {
  await downloadApiFile(
    `${projectPath(projectId)}/schedule/export/task-list-summary`,
    'task-list-summary.xlsx',
  );
}
