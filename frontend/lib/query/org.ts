import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  apiDelete,
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
  createdAt: string;
  updatedAt: string;
  _count?: {
    taskDisciplines: number;
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
  departmentId: string;
  title: string;
  grade: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const orgKeys = {
  all: ['org'] as const,
  departments: (params: PaginationParams) =>
    [...orgKeys.all, 'departments', params] as const,
  disciplines: (params: PaginationParams & { activeOnly?: boolean }) =>
    [...orgKeys.all, 'engineering-disciplines', params] as const,
  positions: (params: PaginationParams) =>
    [...orgKeys.all, 'positions', params] as const,
};

export function useDepartments(
  params: PaginationParams = { page: 1, limit: 100 },
  enabled = true,
) {
  return useQuery({
    queryKey: orgKeys.departments(params),
    queryFn: () =>
      apiGetPaginated<DepartmentRow>(
        `/departments?page=${params.page}&limit=${params.limit}`,
      ),
    enabled,
  });
}

export function usePositions(
  params: PaginationParams = { page: 1, limit: 100 },
  enabled = true,
) {
  return useQuery({
    queryKey: orgKeys.positions(params),
    queryFn: () =>
      apiGetPaginated<Position>(
        `/positions?page=${params.page}&limit=${params.limit}`,
      ),
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
    mutationFn: (body: { name: string; nameZh?: string; isActive?: boolean }) =>
      apiPost<EngineeringDiscipline>('/engineering-disciplines', body),
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
      code: string;
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
        code?: string;
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
