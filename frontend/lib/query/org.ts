import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  apiDelete,
  apiGet,
  apiGetPaginated,
  apiPatch,
  apiPost,
} from '@/lib/api/client';
import type { PaginatedResult, PaginationParams } from '@/lib/api/types';

export interface EngineeringDiscipline {
  id: string;
  companyId: string;
  name: string;
  nameZh: string | null;
  isActive: boolean;
  leaderId: string | null;
  leader?: {
    id: string;
    firstName: string;
    lastName: string;
    chineseName: string | null;
    email: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    users: number;
  };
}

export interface DepartmentRow {
  id: string;
  companyId: string;
  name: string;
  nameZh: string | null;
  code: string;
  isActive: boolean;
  leaderUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Position {
  id: string;
  companyId: string;
  title: string;
  titleZh: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SeniorityLevel {
  id: string;
  companyId: string;
  name: string;
  nameZh: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** Employees on this level (excluding deleted accounts). */
  _count?: { users: number };
}

export interface SeniorityLevelInput {
  name?: string;
  nameZh?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export const orgKeys = {
  all: ['org'] as const,
  seniorityLevels: (isActive?: boolean) =>
    ['org', 'seniority-levels', isActive ?? 'all'] as const,
  departments: (params: PaginationParams & { isActive?: boolean }) =>
    [...orgKeys.all, 'departments', params] as const,
  department: (id: string) => [...orgKeys.all, 'department', id] as const,
  disciplines: (params: PaginationParams & { activeOnly?: boolean }) =>
    [...orgKeys.all, 'engineering-disciplines', params] as const,
  positions: (params: PaginationParams & { isActive?: boolean }) =>
    [...orgKeys.all, 'positions', params] as const,
};

/** Single department by id (name, code, status). */
export function useDepartment(id: string, enabled = true) {
  return useQuery({
    queryKey: orgKeys.department(id),
    queryFn: () => apiGet<DepartmentRow>(`/departments/${id}`),
    enabled: Boolean(id) && enabled,
    retry: false,
  });
}

export function useDepartments(
  params: PaginationParams & { isActive?: boolean } = { page: 1, limit: 100 },
  enabled = true,
) {
  const search = new URLSearchParams({
    page: String(params.page ?? 1),
    limit: String(params.limit ?? 100),
  });
  if (params.isActive !== undefined) {
    search.set('isActive', String(params.isActive));
  }

  return useQuery({
    queryKey: orgKeys.departments(params),
    queryFn: () =>
      apiGetPaginated<DepartmentRow>(`/departments?${search.toString()}`),
    enabled,
  });
}

export function usePositions(
  params: PaginationParams & { isActive?: boolean } = { page: 1, limit: 100 },
  enabled = true,
) {
  const search = new URLSearchParams({
    page: String(params.page ?? 1),
    limit: String(params.limit ?? 100),
  });
  if (params.isActive !== undefined) {
    search.set('isActive', String(params.isActive));
  }

  return useQuery({
    queryKey: orgKeys.positions(params),
    queryFn: () =>
      apiGetPaginated<Position>(`/positions?${search.toString()}`),
    enabled,
  });
}

export function useEngineeringDisciplines(
  params: PaginationParams & { activeOnly?: boolean } = {
    page: 1,
    limit: 200,
    activeOnly: true,
  },
  enabled = true,
) {
  const search = new URLSearchParams({
    page: String(params.page ?? 1),
    limit: String(params.limit ?? 200),
  });
  if (params.activeOnly) {
    search.set('activeOnly', 'true');
  }

  return useQuery({
    queryKey: orgKeys.disciplines(params),
    queryFn: () =>
      apiGetPaginated<EngineeringDiscipline>(
        `/engineering-disciplines?${search.toString()}`,
      ),
    enabled,
  });
}

export function useEngineeringDisciplineOptions(
  activeOnly = true,
  enabled = true,
): {
  options: Array<{ value: string; label: string }>;
  nameById: Map<string, string>;
  isLoading: boolean;
} {
  const query = useEngineeringDisciplines(
    { page: 1, limit: 200, activeOnly },
    enabled,
  );
  const disciplines = query.data?.data ?? [];

  const options = useMemo(
    () =>
      disciplines.map((discipline) => ({
        value: discipline.id,
        label: discipline.nameZh
          ? `${discipline.name} (${discipline.nameZh})`
          : discipline.name,
      })),
    [disciplines],
  );

  const nameById = useMemo(
    () => new Map(disciplines.map((discipline) => [discipline.id, discipline.name])),
    [disciplines],
  );

  return { options, nameById, isLoading: query.isLoading };
}

export function useCreateEngineeringDiscipline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      nameZh?: string;
      isActive?: boolean;
      leaderId?: string | null;
    }) => apiPost<EngineeringDiscipline>('/engineering-disciplines', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orgKeys.all });
    },
  });
}

export function useUpdateEngineeringDiscipline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: {
        name?: string;
        nameZh?: string;
        isActive?: boolean;
        leaderId?: string | null;
      };
    }) => apiPatch<EngineeringDiscipline>(`/engineering-disciplines/${id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orgKeys.all });
    },
  });
}

export function useDeleteEngineeringDiscipline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiDelete<{ message: string }>(`/engineering-disciplines/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orgKeys.all });
    },
  });
}

export function useCreateDepartment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      nameZh?: string;
      leaderUserId?: string;
      forceAlignLeaderDepartment?: boolean;
      isActive?: boolean;
    }) => apiPost<DepartmentRow>('/departments', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orgKeys.all });
    },
  });
}

export function useUpdateDepartment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: {
        name?: string;
        nameZh?: string;
        leaderUserId?: string | null;
        forceAlignLeaderDepartment?: boolean;
        isActive?: boolean;
      };
    }) => apiPatch<DepartmentRow>(`/departments/${id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orgKeys.all });
    },
  });
}

export function useDeleteDepartment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiDelete<{ message: string }>(`/departments/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orgKeys.all });
    },
  });
}

export function useCreatePosition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      title: string;
      titleZh?: string;
      isActive?: boolean;
    }) => apiPost<Position>('/positions', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orgKeys.all });
    },
  });
}

export function useUpdatePosition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: {
        title?: string;
        titleZh?: string;
        isActive?: boolean;
      };
    }) => apiPatch<Position>(`/positions/${id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orgKeys.all });
    },
  });
}

export function useDeletePosition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiDelete<{ message: string }>(`/positions/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orgKeys.all });
    },
  });
}

/** Whole seniority catalogue in display order (short list, not paginated). */
export function useSeniorityLevels(
  params: { isActive?: boolean } = {},
  enabled = true,
) {
  const search = new URLSearchParams();
  if (params.isActive !== undefined) {
    search.set('isActive', String(params.isActive));
  }
  const query = search.toString();
  return useQuery({
    queryKey: orgKeys.seniorityLevels(params.isActive),
    queryFn: () =>
      apiGet<SeniorityLevel[]>(`/seniority-levels${query ? `?${query}` : ''}`),
    enabled,
  });
}

export function useCreateSeniorityLevel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SeniorityLevelInput & { name: string }) =>
      apiPost<SeniorityLevel>('/seniority-levels', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orgKeys.all });
    },
  });
}

export function useUpdateSeniorityLevel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SeniorityLevelInput }) =>
      apiPatch<SeniorityLevel>(`/seniority-levels/${id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orgKeys.all });
    },
  });
}

export function useDeleteSeniorityLevel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiDelete<{ message: string }>(`/seniority-levels/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orgKeys.all });
    },
  });
}
