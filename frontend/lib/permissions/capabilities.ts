import { apiGet, apiGetPaginated } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  ModuleCapabilities,
  PmCapabilities,
  PmModuleKey,
  Project,
  Task,
  TaskDiscipline,
} from '@/lib/api/project-management.types';
import {
  createEmptyPmCapabilities,
  EMPTY_MODULE_CAPABILITIES,
} from '@/lib/api/project-management.types';
import type {
  AuthCapabilities,
  Capabilities,
  EpcCapabilities,
} from '@/lib/api/types';
import { EMPTY_CAPABILITIES, EMPTY_EPC_CAPABILITIES } from '@/lib/api/types';
import { projectPath, toQueryString } from '@/lib/query/pm-query-utils';

const PM_RESOURCE_PATHS: Record<Exclude<PmModuleKey, 'projects'>, string> = {
  schedule: 'schedule/tasks',
  rfis: 'rfis',
  submittals: 'submittals',
  drawings: 'drawings',
  dailyLogs: 'daily-logs',
  meetings: 'meetings',
  correspondence: 'correspondence',
  risks: 'risks',
  issues: 'issues',
  punchItems: 'punch-items',
  closeout: 'closeout',
};

async function probeListEndpoint(path: string): Promise<ModuleCapabilities> {
  try {
    await apiGetPaginated<unknown>(`${path}${toQueryString({ page: 1, limit: 1 })}`);
    return {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
    };
  } catch (error) {
    if (error instanceof ApiRequestError) {
      if (error.status === 403 || error.status === 401) {
        return { ...EMPTY_MODULE_CAPABILITIES };
      }
    }
    return { ...EMPTY_MODULE_CAPABILITIES };
  }
}

async function probeGetCollection(path: string): Promise<boolean> {
  try {
    await apiGet<unknown>(path);
    return true;
  } catch (error) {
    if (error instanceof ApiRequestError) {
      if (error.status === 403 || error.status === 401) {
        return false;
      }
    }
    return false;
  }
}

/**
 * Probes EPC workspace read endpoints (review inbox, comments, engineering list).
 */
export async function fetchEpcCapabilities(
  sampleProjectId?: string,
  scheduleCanView = false,
): Promise<EpcCapabilities> {
  const [canViewReviewInbox, canViewMyComments] = await Promise.all([
    probeGetCollection('/review-inbox'),
    probeGetCollection('/my-comments'),
  ]);

  let canViewEngineering = false;

  if (sampleProjectId) {
    canViewEngineering = await probeEngineeringDocuments(sampleProjectId);
  }

  if (!canViewEngineering && scheduleCanView) {
    canViewEngineering = scheduleCanView;
  }

  return {
    canViewReviewInbox,
    canViewMyComments,
    canViewEngineering,
  };
}

async function probeEngineeringDocuments(projectId: string): Promise<boolean> {
  try {
    const tasks = await apiGetPaginated<Task>(
      `${projectPath(projectId, 'schedule')}/tasks${toQueryString({
        page: 1,
        limit: 20,
      })}`,
    );

    for (const task of tasks.data) {
      const disciplines = await apiGet<TaskDiscipline[]>(
        `${projectPath(projectId, 'schedule')}/tasks/${task.id}/disciplines`,
      );

      if (disciplines.length === 0) {
        continue;
      }

      const disciplineId = disciplines[0]!.id;
      await apiGetPaginated<unknown>(
        `${projectPath(projectId)}/task-disciplines/${disciplineId}/engineering-documents${toQueryString(
          { page: 1, limit: 1 },
        )}`,
      );
      return true;
    }

    return false;
  } catch (error) {
    if (error instanceof ApiRequestError) {
      if (error.status === 403 || error.status === 401) {
        return false;
      }
    }
    return false;
  }
}

/**
 * Probes anticipated PM REST endpoints to resolve view access per submodule.
 * Create/edit/delete flags remain false until the backend exposes them via RBAC.
 */
export async function fetchPmCapabilities(): Promise<PmCapabilities> {
  const pm = createEmptyPmCapabilities();

  const projectsProbe = await probeListEndpoint('/projects');
  pm.projects = projectsProbe;

  if (!projectsProbe.canView) {
    return pm;
  }

  let sampleProjectId: string | undefined;
  try {
    const projects = await apiGetPaginated<Project>(
      `/projects${toQueryString({ page: 1, limit: 1 })}`,
    );
    sampleProjectId = projects.data[0]?.id;
  } catch {
    return pm;
  }

  const submoduleEntries = Object.entries(PM_RESOURCE_PATHS) as Array<
    [Exclude<PmModuleKey, 'projects'>, string]
  >;

  if (!sampleProjectId) {
    for (const [moduleKey] of submoduleEntries) {
      pm[moduleKey] = { ...projectsProbe };
    }
    return pm;
  }

  for (const [moduleKey, resource] of submoduleEntries) {
    pm[moduleKey] = await probeListEndpoint(
      projectPath(sampleProjectId as string, resource),
    );
  }

  return pm;
}

/**
 * Loads UI capability flags for the authenticated session.
 */
export async function fetchCapabilities(): Promise<Capabilities> {
  let authCapabilities: AuthCapabilities = {
    canManageUsers: EMPTY_CAPABILITIES.canManageUsers,
    canCreateUsers: EMPTY_CAPABILITIES.canCreateUsers,
    canManageRoles: EMPTY_CAPABILITIES.canManageRoles,
    canEditRoles: EMPTY_CAPABILITIES.canEditRoles,
    canViewNotifications: EMPTY_CAPABILITIES.canViewNotifications,
  };

  try {
    authCapabilities = await apiGet<AuthCapabilities>('/auth/capabilities');
  } catch {
    authCapabilities = {
      canManageUsers: false,
      canCreateUsers: false,
      canManageRoles: false,
      canEditRoles: false,
      canViewNotifications: false,
    };
  }

  const pm = await fetchPmCapabilities();

  let sampleProjectId: string | undefined;
  if (pm.projects.canView) {
    try {
      const projects = await apiGetPaginated<Project>(
        `/projects${toQueryString({ page: 1, limit: 1 })}`,
      );
      sampleProjectId = projects.data[0]?.id;
    } catch {
      sampleProjectId = undefined;
    }
  }

  const epc = await fetchEpcCapabilities(
    sampleProjectId,
    pm.schedule.canView,
  );

  return {
    ...authCapabilities,
    pm,
    epc,
  };
}

export { EMPTY_EPC_CAPABILITIES };
