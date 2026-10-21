'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import {
  apiClient,
  apiDelete,
  apiGet,
  apiGetPaginated,
  apiPatch,
  apiPost,
  apiPut,
} from '@/lib/api/client';
import type {
  SetProjectTeamRequest,
  CreateProjectRequest,
  Project,
  ProjectDashboardStats,
  ProjectListFilters,
  ProjectSummary,
  ProjectTeamMember,
  UpdateProjectRequest,
} from '@/lib/api/project-management.types';
import type { MessageResponse, PaginationMeta, PaginationParams, User } from '@/lib/api/types';
import { USER_DIRECTORY_PAGE_LIMIT } from '@/lib/query/users';
import { projectPath, toQueryString } from '@/lib/query/pm-query-utils';

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

/** Maximum page size allowed by the API pagination DTO. */
export const PROJECT_LIST_PAGE_SIZE = 100;

export type ProjectListParams = PaginationParams & ProjectListFilters;

export const projectKeys = {
  all: ['pm', 'projects'] as const,
  lists: () => [...projectKeys.all, 'list'] as const,
  list: (params: PaginationParams & ProjectListFilters) =>
    [...projectKeys.lists(), params] as const,
  details: () => [...projectKeys.all, 'detail'] as const,
  detail: (id: string) => [...projectKeys.details(), id] as const,
  dashboard: (id: string) => [...projectKeys.all, 'dashboard', id] as const,
  team: (id: string) => [...projectKeys.all, 'team', id] as const,
  assignableUsers: (id: string) =>
    [...projectKeys.all, 'assignable-users', id] as const,
};

export function useProjects(
  params: ProjectListParams = { page: 1, limit: 20 },
  enabled = true,
  options?: Omit<UseQueryOptions<PaginatedResult<Project>>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: projectKeys.list(params),
    queryFn: () =>
      apiGetPaginated<Project>(`/projects${toQueryString(params)}`),
    enabled,
    retry: false,
    ...options,
  });
}

/**
 * Loads all projects for portfolio views by walking paginated list endpoints.
 */
export function useAllProjects(
  params: Omit<ProjectListParams, 'page' | 'limit'> = {},
  enabled = true,
  options?: Omit<UseQueryOptions<PaginatedResult<Project>>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: [...projectKeys.lists(), 'all', params] as const,
    queryFn: async (): Promise<PaginatedResult<Project>> => {
      const firstPage = await apiGetPaginated<Project>(
        `/projects${toQueryString({
          ...params,
          page: 1,
          limit: PROJECT_LIST_PAGE_SIZE,
        })}`,
      );

      if (firstPage.meta.pages <= 1) {
        return firstPage;
      }

      const data: Project[] = [...firstPage.data];

      // Fetch pages sequentially (instead of Promise.all) to avoid throttling
      // on the backend for large portfolios.
      for (let page = 2; page <= firstPage.meta.pages; page += 1) {
        const result = await apiGetPaginated<Project>(
          `/projects${toQueryString({
            ...params,
            page,
            limit: PROJECT_LIST_PAGE_SIZE,
          })}`,
        );
        data.push(...result.data);
      }

      return {
        data,
        meta: {
          total: firstPage.meta.total,
          page: 1,
          limit: firstPage.meta.total,
          pages: 1,
        },
      };
    },
    enabled,
    retry: false,
    staleTime: 30_000,
    ...options,
  });
}

/**
 * Loads every project matching the supplied filters for exports.
 */
export async function fetchAllProjects(
  params: Omit<ProjectListParams, 'page' | 'limit'> = {},
): Promise<Project[]> {
  let page = 1;
  let pages = 1;
  const projects: Project[] = [];

  do {
    const result = await apiGetPaginated<Project>(
      `/projects${toQueryString({
        ...params,
        page,
        limit: PROJECT_LIST_PAGE_SIZE,
      })}`,
    );
    projects.push(...result.data);
    pages = result.meta.pages;
    page += 1;
  } while (page <= pages);

  return projects;
}

export function useProject(id: string, enabled = true) {
  return useQuery({
    queryKey: projectKeys.detail(id),
    queryFn: () => apiGet<Project>(projectPath(id)),
    enabled: Boolean(id) && enabled,
    retry: false,
  });
}

export function useProjectDashboardStats(projectId: string, enabled = true) {
  return useQuery({
    queryKey: projectKeys.dashboard(projectId),
    queryFn: () =>
      apiGet<ProjectDashboardStats>(`${projectPath(projectId)}/dashboard`),
    enabled: Boolean(projectId) && enabled,
    retry: false,
  });
}

export function useProjectTeam(projectId: string, enabled = true) {
  return useQuery({
    queryKey: projectKeys.team(projectId),
    queryFn: () =>
      apiGet<ProjectTeamMember[]>(`${projectPath(projectId)}/team`),
    enabled: Boolean(projectId) && enabled,
    retry: false,
  });
}

/**
 * Loads every active company user assignable on a project (paginates until complete).
 */
export async function fetchAllProjectAssignableUsers(
  projectId: string,
): Promise<User[]> {
  const limit = USER_DIRECTORY_PAGE_LIMIT;
  let page = 1;
  let pages = 1;
  const users: User[] = [];

  do {
    const result = await apiGetPaginated<User>(
      `${projectPath(projectId)}/assignable-users${toQueryString({
        page,
        limit,
        sortBy: 'lastName',
        sortOrder: 'asc',
      })}`,
    );
    users.push(...result.data);
    pages = result.meta.pages;
    page += 1;
  } while (page <= pages);

  return users;
}

/**
 * Project-scoped user directory for role assignment pickers.
 * Works for discipline-scoped users without global projects.view.
 */
export function useProjectAssignableUsers(
  projectId: string,
  options?: Omit<UseQueryOptions<User[]>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: [...projectKeys.assignableUsers(projectId), 'all'] as const,
    queryFn: () => fetchAllProjectAssignableUsers(projectId),
    enabled: Boolean(projectId),
    retry: false,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateProjectRequest) =>
      apiPost<Project>('/projects', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      body,
    }: {
      projectId: string;
      body: UpdateProjectRequest;
    }) => apiPatch<Project>(projectPath(projectId), body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
      void queryClient.invalidateQueries({
        queryKey: projectKeys.detail(variables.projectId),
      });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projectId: string) =>
      apiDelete<MessageResponse>(projectPath(projectId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
    },
  });
}

export function useSetProjectTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      body,
    }: {
      projectId: string;
      body: SetProjectTeamRequest;
    }) =>
      apiPut<ProjectTeamMember[]>(
        `${projectPath(projectId)}/team`,
        body,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: projectKeys.team(variables.projectId),
      });
    },
  });
}

export function toProjectSummary(project: Project): ProjectSummary {
  return {
    id: project.id,
    projectCode: project.projectCode,
    name: project.name,
    nameZh: project.nameZh,
    status: project.status,
    responsiblePersonId: project.responsiblePersonId,
    plannedFinishDate: project.plannedFinishDate,
    budget: project.budget,
    currency: project.currency,
  };
}

async function openBlobPdf(url: string): Promise<void> {
  const response = await apiClient.get(url, { responseType: 'blob' });
  const contentType = response.headers['content-type'];
  const blob = new Blob([response.data as BlobPart], {
    type: typeof contentType === 'string' && contentType.includes('pdf') ? contentType : 'application/pdf',
  });
  const objectUrl = URL.createObjectURL(blob);
  const opened = window.open(objectUrl, '_blank', 'noopener,noreferrer');
  if (!opened) {
    const anchor = document.createElement('a');
    anchor.href = objectUrl; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; anchor.click();
  }
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export async function openProjectsExportPdf(status?: string): Promise<void> {
  const params = status ? `?status=${encodeURIComponent(status)}` : '';
  return openBlobPdf(`/projects/export/pdf${params}`);
}

export async function openProjectReportPdf(projectId: string): Promise<void> {
  return openBlobPdf(`/projects/${projectId}/report/pdf`);
}
