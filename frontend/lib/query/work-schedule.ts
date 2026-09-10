'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api/client';
import type {
  AssignSchedulePayload,
  CreatePublicHolidayPayload,
  CreateWorkSchedulePayload,
  EmployeeScheduleView,
  ListPublicHolidaysParams,
  PreviewDaysResult,
  LeavePeriodInput,
  PublicHoliday,
  UpdatePublicHolidayPayload,
  UpdateWorkSchedulePayload,
  WorkSchedule,
} from '@/lib/api/work-schedule.types';

const SCHEDULE_PATH = '/hr/work-schedules';
const HOLIDAY_PATH = '/hr/public-holidays';

function holidayListQuery(params: ListPublicHolidaysParams): string {
  const search = new URLSearchParams();
  if (params.year !== undefined) {
    search.set('year', String(params.year));
  }
  if (params.nationality) {
    search.set('nationality', params.nationality);
  }
  if (params.isActive !== undefined) {
    search.set('isActive', String(params.isActive));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

export const workScheduleKeys = {
  all: ['work-schedules'] as const,
  lists: () => [...workScheduleKeys.all, 'list'] as const,
  list: () => [...workScheduleKeys.lists()] as const,
  details: () => [...workScheduleKeys.all, 'detail'] as const,
  detail: (id: string) => [...workScheduleKeys.details(), id] as const,
  employee: (employeeId: string) =>
    [...workScheduleKeys.all, 'employee', employeeId] as const,
  preview: (employeeId: string, periods: LeavePeriodInput[]) =>
    [...workScheduleKeys.all, 'preview', employeeId, periods] as const,
};

export const publicHolidayKeys = {
  all: ['public-holidays'] as const,
  lists: () => [...publicHolidayKeys.all, 'list'] as const,
  list: (params: ListPublicHolidaysParams) =>
    [...publicHolidayKeys.lists(), params] as const,
  details: () => [...publicHolidayKeys.all, 'detail'] as const,
  detail: (id: string) => [...publicHolidayKeys.details(), id] as const,
};

export function useWorkScheduleList(enabled = true) {
  return useQuery({
    queryKey: workScheduleKeys.list(),
    queryFn: () => apiGet<WorkSchedule[]>(SCHEDULE_PATH),
    enabled,
    staleTime: 30_000,
  });
}

export function useWorkSchedule(id: string, enabled = true) {
  return useQuery({
    queryKey: workScheduleKeys.detail(id),
    queryFn: () => apiGet<WorkSchedule>(`${SCHEDULE_PATH}/${id}`),
    enabled: Boolean(id) && enabled,
    retry: false,
  });
}

export function useEmployeeWorkSchedule(employeeId: string, enabled = true) {
  return useQuery({
    queryKey: workScheduleKeys.employee(employeeId),
    queryFn: () =>
      apiGet<EmployeeScheduleView>(`${SCHEDULE_PATH}/employees/${employeeId}`),
    enabled: Boolean(employeeId) && enabled,
    staleTime: 30_000,
  });
}

export function useCreateWorkSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateWorkSchedulePayload) =>
      apiPost<WorkSchedule>(SCHEDULE_PATH, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workScheduleKeys.all });
    },
  });
}

export function useUpdateWorkSchedule(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateWorkSchedulePayload) =>
      apiPatch<WorkSchedule>(`${SCHEDULE_PATH}/${id}`, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workScheduleKeys.all });
    },
  });
}

export function useDeactivateWorkSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiDelete<WorkSchedule>(`${SCHEDULE_PATH}/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workScheduleKeys.all });
    },
  });
}

export function useSetDefaultWorkSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiPost<WorkSchedule>(`${SCHEDULE_PATH}/${id}/set-default`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workScheduleKeys.all });
    },
  });
}

export function useAssignWorkSchedule(scheduleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AssignSchedulePayload) =>
      apiPost<unknown>(`${SCHEDULE_PATH}/${scheduleId}/assign`, payload),
    onSuccess: (_data, payload) => {
      void queryClient.invalidateQueries({ queryKey: workScheduleKeys.all });
      void queryClient.invalidateQueries({
        queryKey: workScheduleKeys.employee(payload.employeeId),
      });
    },
  });
}

export function usePreviewLeaveDays() {
  return useMutation({
    mutationFn: (payload: {
      employeeId?: string;
      periods: LeavePeriodInput[];
    }) => apiPost<PreviewDaysResult>(`${SCHEDULE_PATH}/preview-days`, payload),
  });
}

export function usePublicHolidayList(
  params: ListPublicHolidaysParams = {},
  enabled = true,
) {
  return useQuery({
    queryKey: publicHolidayKeys.list(params),
    queryFn: () =>
      apiGet<PublicHoliday[]>(`${HOLIDAY_PATH}${holidayListQuery(params)}`),
    enabled,
    staleTime: 30_000,
  });
}

export function useCreatePublicHoliday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePublicHolidayPayload) =>
      apiPost<PublicHoliday>(HOLIDAY_PATH, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: publicHolidayKeys.all });
    },
  });
}

export function useUpdatePublicHoliday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: UpdatePublicHolidayPayload;
    }) => apiPatch<PublicHoliday>(`${HOLIDAY_PATH}/${id}`, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: publicHolidayKeys.all });
    },
  });
}

export function useDeactivatePublicHoliday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiDelete<PublicHoliday>(`${HOLIDAY_PATH}/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: publicHolidayKeys.all });
    },
  });
}

export function useBulkHolidayStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { ids: string[]; isActive: boolean }) =>
      apiPost<{ updated: number }>(`${HOLIDAY_PATH}/bulk-status`, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: publicHolidayKeys.all });
    },
  });
}

export function useDuplicateHolidayYear() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { fromYear: number; toYear: number }) =>
      apiPost<{ copied: number; skipped: number }>(
        `${HOLIDAY_PATH}/duplicate-year`,
        payload,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: publicHolidayKeys.all });
    },
  });
}
