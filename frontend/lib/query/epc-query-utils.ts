import { projectPath } from '@/lib/query/pm-query-utils';

/** Poll interval while package/discipline projection is in flight. */
export const PROJECTION_POLL_MS = 2_000;

/**
 * Base path for task-discipline scoped EPC resources.
 */
export function taskDisciplinePath(
  projectId: string,
  taskDisciplineId: string,
  resource?: string,
): string {
  const base = `${projectPath(projectId)}/task-disciplines/${taskDisciplineId}`;
  return resource ? `${base}/${resource}` : base;
}

export function designPackagesPath(
  projectId: string,
  taskDisciplineId: string,
  packageId?: string,
  suffix?: string,
): string {
  const base = taskDisciplinePath(projectId, taskDisciplineId, 'design-packages');
  if (!packageId) {
    return base;
  }
  const pkg = `${base}/${packageId}`;
  return suffix ? `${pkg}/${suffix}` : pkg;
}

export function engineeringDocumentsPath(
  projectId: string,
  taskDisciplineId: string,
  engineeringDocumentId?: string,
  suffix?: string,
): string {
  const base = taskDisciplinePath(
    projectId,
    taskDisciplineId,
    'engineering-documents',
  );
  if (!engineeringDocumentId) {
    return base;
  }
  const doc = `${base}/${engineeringDocumentId}`;
  return suffix ? `${doc}/${suffix}` : doc;
}
