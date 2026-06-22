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
  ActionItem,
  CreateActionItemRequest,
  CreateMeetingAgendaItemRequest,
  CreateMeetingAttendeeRequest,
  CreateMeetingRequest,
  Meeting,
  MeetingAgendaItem,
  MeetingAttendee,
  MeetingDetail,
  MeetingStatus,
  PmListFilters,
  UpdateActionItemRequest,
  UpdateMeetingAgendaItemRequest,
  UpdateMeetingAttendeeRequest,
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
    }) => apiPost<MeetingDetail>(meetingsPath(projectId), body),
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
      void invalidateMeetingDetail(queryClient, variables);
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

export function useAddMeetingAgendaItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      meetingId,
      body,
    }: {
      projectId: string;
      meetingId: string;
      body: CreateMeetingAgendaItemRequest;
    }) =>
      apiPost<MeetingAgendaItem>(
        `${meetingsPath(projectId)}/${meetingId}/agenda`,
        body,
      ),
    onSuccess: (_data, variables) => {
      void invalidateMeetingDetail(queryClient, variables);
    },
  });
}

export function useUpdateMeetingAgendaItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      meetingId,
      agendaItemId,
      body,
    }: {
      projectId: string;
      meetingId: string;
      agendaItemId: string;
      body: UpdateMeetingAgendaItemRequest;
    }) =>
      apiPatch<MeetingAgendaItem>(
        `${meetingsPath(projectId)}/${meetingId}/agenda/${agendaItemId}`,
        body,
      ),
    onSuccess: (_data, variables) => {
      void invalidateMeetingDetail(queryClient, variables);
    },
  });
}

export function useRemoveMeetingAgendaItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      meetingId,
      agendaItemId,
    }: {
      projectId: string;
      meetingId: string;
      agendaItemId: string;
    }) =>
      apiDelete<MessageResponse>(
        `${meetingsPath(projectId)}/${meetingId}/agenda/${agendaItemId}`,
      ),
    onSuccess: (_data, variables) => {
      void invalidateMeetingDetail(queryClient, variables);
    },
  });
}

export function useAddMeetingAttendee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      meetingId,
      body,
    }: {
      projectId: string;
      meetingId: string;
      body: CreateMeetingAttendeeRequest;
    }) =>
      apiPost<MeetingAttendee>(
        `${meetingsPath(projectId)}/${meetingId}/attendees`,
        body,
      ),
    onSuccess: (_data, variables) => {
      void invalidateMeetingDetail(queryClient, variables);
    },
  });
}

export function useUpdateMeetingAttendee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      meetingId,
      attendeeId,
      body,
    }: {
      projectId: string;
      meetingId: string;
      attendeeId: string;
      body: UpdateMeetingAttendeeRequest;
    }) =>
      apiPatch<MeetingAttendee>(
        `${meetingsPath(projectId)}/${meetingId}/attendees/${attendeeId}`,
        body,
      ),
    onSuccess: (_data, variables) => {
      void invalidateMeetingDetail(queryClient, variables);
    },
  });
}

export function useRemoveMeetingAttendee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      meetingId,
      attendeeId,
    }: {
      projectId: string;
      meetingId: string;
      attendeeId: string;
    }) =>
      apiDelete<MessageResponse>(
        `${meetingsPath(projectId)}/${meetingId}/attendees/${attendeeId}`,
      ),
    onSuccess: (_data, variables) => {
      void invalidateMeetingDetail(queryClient, variables);
    },
  });
}

export function useAddMeetingActionItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      meetingId,
      body,
    }: {
      projectId: string;
      meetingId: string;
      body: CreateActionItemRequest;
    }) =>
      apiPost<ActionItem>(
        `${meetingsPath(projectId)}/${meetingId}/action-items`,
        body,
      ),
    onSuccess: (_data, variables) => {
      void invalidateMeetingDetail(queryClient, variables);
    },
  });
}

export function useUpdateMeetingActionItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      meetingId,
      actionItemId,
      body,
    }: {
      projectId: string;
      meetingId: string;
      actionItemId: string;
      body: UpdateActionItemRequest;
    }) =>
      apiPatch<ActionItem>(
        `${meetingsPath(projectId)}/${meetingId}/action-items/${actionItemId}`,
        body,
      ),
    onSuccess: (_data, variables) => {
      void invalidateMeetingDetail(queryClient, variables);
    },
  });
}

export function useRemoveMeetingActionItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      meetingId,
      actionItemId,
    }: {
      projectId: string;
      meetingId: string;
      actionItemId: string;
    }) =>
      apiDelete<MessageResponse>(
        `${meetingsPath(projectId)}/${meetingId}/action-items/${actionItemId}`,
      ),
    onSuccess: (_data, variables) => {
      void invalidateMeetingDetail(queryClient, variables);
    },
  });
}

function invalidateMeetingDetail(
  queryClient: ReturnType<typeof useQueryClient>,
  variables: { projectId: string; meetingId: string },
): void {
  void queryClient.invalidateQueries({
    queryKey: meetingKeys.lists(variables.projectId),
  });
  void queryClient.invalidateQueries({
    queryKey: meetingKeys.detail(variables.projectId, variables.meetingId),
  });
}
