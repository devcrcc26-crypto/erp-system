'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api/client';
import type {
  AssignSchedulePayload,
  AssignScheduleResult,
  AttendanceRecalcResult,
  CreatePublicHolidayPayload,
  CreateWorkSchedulePayload,
  DeleteWorkScheduleResult,
  EmployeeScheduleView,
  ListPublicHolidaysParams,
  PreviewDaysResult,
  LeavePeriodInput,
  MyUpcomingHoliday,
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
  if (params.upcoming !== undefined) {
    search.set('upcoming', String(params.upcoming));
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
  mine: () => [...workScheduleKeys.all, 'mine'] as const,
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
  myUpcoming: (days: number) =>
    [...publicHolidayKeys.all, 'my-upcoming', days] as const,
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

/** The signed-in employee's active schedule (null when none is configured). */
export function useMyWorkSchedule(enabled = true) {
  return useQuery({
    queryKey: workScheduleKeys.mine(),
    queryFn: () => apiGet<WorkSchedule | null>(`${SCHEDULE_PATH}/my`),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

/** Active holidays in the next `days` days that apply to the signed-in employee. */
export function useMyUpcomingHolidays(days = 60, enabled = true) {
  return useQuery({
    queryKey: publicHolidayKeys.myUpcoming(days),
    queryFn: () =>
      apiGet<MyUpcomingHoliday[]>(`${HOLIDAY_PATH}/my/upcoming?days=${days}`),
    enabled,
    staleTime: 60_000,
    retry: false,
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
      apiPatch<WorkSchedule & { attendanceRecalc?: AttendanceRecalcResult | null }>(
        `${SCHEDULE_PATH}/${id}`,
        payload,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workScheduleKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
  });
}

/** Keeps the schedule on record; it stops being offered for new assignments. */
export function useDeactivateWorkSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiPatch<WorkSchedule>(`${SCHEDULE_PATH}/${id}`, { isActive: false }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workScheduleKeys.all });
    },
  });
}

/** Deletes the schedule; everyone on it moves to the company default. */
export function useDeleteWorkSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiDelete<DeleteWorkScheduleResult>(`${SCHEDULE_PATH}/${id}`),
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

export function useAssignWorkSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      scheduleId,
      ...payload
    }: AssignSchedulePayload & { scheduleId: string }) =>
      apiPost<AssignScheduleResult>(
        `${SCHEDULE_PATH}/${scheduleId}/assign`,
        payload,
      ),
    onSuccess: (_data, payload) => {
      void queryClient.invalidateQueries({ queryKey: workScheduleKeys.all });
      void queryClient.invalidateQueries({
        queryKey: workScheduleKeys.employee(payload.employeeId),
      });
      void queryClient.invalidateQueries({ queryKey: ['attendance'] });
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

export function usePublicHoliday(id: string, enabled = true) {
  return useQuery({
    queryKey: publicHolidayKeys.detail(id),
    queryFn: () => apiGet<PublicHoliday>(`${HOLIDAY_PATH}/${id}`),
    enabled: Boolean(id) && enabled,
    retry: false,
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

/** Keeps the holiday on record; day calculations ignore it. */
export function useDeactivatePublicHoliday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiPatch<PublicHoliday>(`${HOLIDAY_PATH}/${id}`, { isActive: false }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: publicHolidayKeys.all });
    },
  });
}

/** Removes the holiday from the calendar for good. */
export function useDeletePublicHoliday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`${HOLIDAY_PATH}/${id}`),
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
