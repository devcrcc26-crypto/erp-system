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
  CreateDrawingLinkRequest,
  CreateDrawingRequest,
  Drawing,
  DrawingLink,
  DrawingVersion,
  PmListFilters,
  UpdateDrawingRequest,
} from '@/lib/api/project-management.types';
import type { MessageResponse, PaginationMeta, PaginationParams } from '@/lib/api/types';
import { projectPath, toQueryString } from '@/lib/query/pm-query-utils';

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

const drawingsPath = (projectId: string): string =>
  projectPath(projectId, 'drawings');

export const drawingKeys = {
  all: ['pm', 'drawings'] as const,
  lists: (projectId: string) =>
    [...drawingKeys.all, projectId, 'list'] as const,
  list: (
    projectId: string,
    params: PaginationParams & PmListFilters & { discipline?: string } = {
      page: 1,
      limit: 20,
    },
  ) => [...drawingKeys.lists(projectId), params] as const,
  details: (projectId: string) =>
    [...drawingKeys.all, projectId, 'detail'] as const,
  detail: (projectId: string, drawingId: string) =>
    [...drawingKeys.details(projectId), drawingId] as const,
  versions: (projectId: string, drawingId: string) =>
    [...drawingKeys.detail(projectId, drawingId), 'versions'] as const,
  links: (projectId: string, drawingId: string) =>
    [...drawingKeys.detail(projectId, drawingId), 'links'] as const,
};

export function useDrawings(
  projectId: string,
  params: PaginationParams & PmListFilters & { discipline?: string } = {
    page: 1,
    limit: 20,
  },
  enabled = true,
  options?: Omit<
    UseQueryOptions<PaginatedResult<Drawing>>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: drawingKeys.list(projectId, params),
    queryFn: () =>
      apiGetPaginated<Drawing>(
        `${drawingsPath(projectId)}${toQueryString(params)}`,
      ),
    enabled: Boolean(projectId) && enabled,
    retry: false,
    ...options,
  });
}

export function useDrawing(
  projectId: string,
  drawingId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: drawingKeys.detail(projectId, drawingId),
    queryFn: () =>
      apiGet<Drawing>(`${drawingsPath(projectId)}/${drawingId}`),
    enabled: Boolean(projectId) && Boolean(drawingId) && enabled,
    retry: false,
  });
}

export function useDrawingVersions(
  projectId: string,
  drawingId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: drawingKeys.versions(projectId, drawingId),
    queryFn: () =>
      apiGet<DrawingVersion[]>(
        `${drawingsPath(projectId)}/${drawingId}/versions`,
      ),
    enabled: Boolean(projectId) && Boolean(drawingId) && enabled,
    retry: false,
  });
}

export function useDrawingLinks(
  projectId: string,
  drawingId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: drawingKeys.links(projectId, drawingId),
    queryFn: () =>
      apiGet<DrawingLink[]>(
        `${drawingsPath(projectId)}/${drawingId}/links`,
      ),
    enabled: Boolean(projectId) && Boolean(drawingId) && enabled,
    retry: false,
  });
}

export function useCreateDrawing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      body,
    }: {
      projectId: string;
      body: CreateDrawingRequest;
    }) => apiPost<Drawing>(drawingsPath(projectId), body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: drawingKeys.lists(variables.projectId),
      });
    },
  });
}

export function useUpdateDrawing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      drawingId,
      body,
    }: {
      projectId: string;
      drawingId: string;
      body: UpdateDrawingRequest;
    }) =>
      apiPatch<Drawing>(
        `${drawingsPath(projectId)}/${drawingId}`,
        body,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: drawingKeys.lists(variables.projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: drawingKeys.detail(variables.projectId, variables.drawingId),
      });
    },
  });
}

export function useDeleteDrawing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      drawingId,
    }: {
      projectId: string;
      drawingId: string;
    }) =>
      apiDelete<MessageResponse>(
        `${drawingsPath(projectId)}/${drawingId}`,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: drawingKeys.lists(variables.projectId),
      });
    },
  });
}

export function useCreateDrawingLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      drawingId,
      body,
    }: {
      projectId: string;
      drawingId: string;
      body: CreateDrawingLinkRequest;
    }) =>
      apiPost<DrawingLink>(
        `${drawingsPath(projectId)}/${drawingId}/links`,
        body,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: drawingKeys.links(variables.projectId, variables.drawingId),
      });
    },
  });
}

export function useDeleteDrawingLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      drawingId,
      linkId,
    }: {
      projectId: string;
      drawingId: string;
      linkId: string;
    }) =>
      apiDelete<MessageResponse>(
        `${drawingsPath(projectId)}/${drawingId}/links/${linkId}`,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: drawingKeys.links(variables.projectId, variables.drawingId),
      });
    },
  });
}
