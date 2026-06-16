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
  CreateMeetingRequest,
  Meeting,
  MeetingDetail,
  MeetingStatus,
  PmListFilters,
  UpdateMeetingRequest,
} from '@/lib/api/project-management.types';
import type { MessageResponse, PaginationMeta, PaginationParams } from '@/lib/api/types';
import { projectPath, toQueryString } from '@/lib/query/pm-query-utils';

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

const meetingsPath = (projectId: string): string =>
  projectPath(projectId, 'meetings');

export const meetingKeys = {
  all: ['pm', 'meetings'] as const,
  lists: (projectId: string) =>
    [...meetingKeys.all, projectId, 'list'] as const,
  list: (
    projectId: string,
    params: PaginationParams & PmListFilters & { status?: MeetingStatus } = {
      page: 1,
      limit: 20,
    },
  ) => [...meetingKeys.lists(projectId), params] as const,
  details: (projectId: string) =>
    [...meetingKeys.all, projectId, 'detail'] as const,
  detail: (projectId: string, meetingId: string) =>
    [...meetingKeys.details(projectId), meetingId] as const,
};

export function useMeetings(
  projectId: string,
  params: PaginationParams & PmListFilters & { status?: MeetingStatus } = {
    page: 1,
    limit: 20,
  },
  enabled = true,
  options?: Omit<
    UseQueryOptions<PaginatedResult<Meeting>>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: meetingKeys.list(projectId, params),
    queryFn: () =>
      apiGetPaginated<Meeting>(
        `${meetingsPath(projectId)}${toQueryString(params)}`,
      ),
    enabled: Boolean(projectId) && enabled,
    retry: false,
    ...options,
  });
}

export function useMeeting(
  projectId: string,
  meetingId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: meetingKeys.detail(projectId, meetingId),
    queryFn: () =>
      apiGet<MeetingDetail>(`${meetingsPath(projectId)}/${meetingId}`),
    enabled: Boolean(projectId) && Boolean(meetingId) && enabled,
    retry: false,
  });
}

export function useCreateMeeting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      body,
    }: {
      projectId: string;
      body: CreateMeetingRequest;
    }) => apiPost<Meeting>(meetingsPath(projectId), body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: meetingKeys.lists(variables.projectId),
      });
    },
  });
}

export function useUpdateMeeting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      meetingId,
      body,
    }: {
      projectId: string;
      meetingId: string;
      body: UpdateMeetingRequest;
    }) =>
      apiPatch<MeetingDetail>(
        `${meetingsPath(projectId)}/${meetingId}`,
        body,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: meetingKeys.lists(variables.projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: meetingKeys.detail(variables.projectId, variables.meetingId),
      });
    },
  });
}

export function useDeleteMeeting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      meetingId,
    }: {
      projectId: string;
      meetingId: string;
    }) =>
      apiDelete<MessageResponse>(
        `${meetingsPath(projectId)}/${meetingId}`,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: meetingKeys.lists(variables.projectId),
      });
    },
  });
}
