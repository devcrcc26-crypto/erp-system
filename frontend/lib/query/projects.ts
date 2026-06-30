'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import {
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
import type { MessageResponse, PaginationMeta, PaginationParams } from '@/lib/api/types';
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
    nameEn: project.nameEn,
    nameZh: project.nameZh,
    status: project.status,
    projectManagerId: project.projectManagerId,
    plannedFinishDate: project.plannedFinishDate,
    budget: project.budget,
    currency: project.currency,
  };
}
