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
} from '@/lib/api/client';
import type {
  AddProjectTeamMemberRequest,
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
  params: PaginationParams & ProjectListFilters = { page: 1, limit: 20 },
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

export function useAddProjectTeamMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      body,
    }: {
      projectId: string;
      body: AddProjectTeamMemberRequest;
    }) =>
      apiPost<ProjectTeamMember>(
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

export function useRemoveProjectTeamMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      memberId,
    }: {
      projectId: string;
      memberId: string;
    }) =>
      apiDelete<MessageResponse>(
        `${projectPath(projectId)}/team/${memberId}`,
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
    status: project.status,
    projectManagerId: project.projectManagerId,
    plannedFinishDate: project.plannedFinishDate,
    budget: project.budget,
    currency: project.currency,
  };
}
