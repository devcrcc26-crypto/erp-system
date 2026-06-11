'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import {
  apiGet,
  apiGetPaginated,
  apiPost,
  apiPut,
} from '@/lib/api/client';
import type {
  CreateRoleRequest,
  PaginationParams,
  Permission,
  Role,
  RoleDetail,
  UpdateRolePermissionsRequest,
} from '@/lib/api/types';

export const roleKeys = {
  all: ['roles'] as const,
  lists: () => [...roleKeys.all, 'list'] as const,
  list: (params: PaginationParams) => [...roleKeys.lists(), params] as const,
  details: () => [...roleKeys.all, 'detail'] as const,
  detail: (id: string) => [...roleKeys.details(), id] as const,
  permissions: () => [...roleKeys.all, 'permissions'] as const,
};

function toQueryString(params: PaginationParams): string {
  const search = new URLSearchParams();
  if (params.page !== undefined) search.set('page', String(params.page));
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.sortBy) search.set('sortBy', params.sortBy);
  if (params.sortOrder) search.set('sortOrder', params.sortOrder);
  const query = search.toString();
  return query ? `?${query}` : '';
}

export function useRoles(
  params: PaginationParams = { page: 1, limit: 100 },
  options?: Omit<
    UseQueryOptions<{ data: Role[]; meta: { total: number; page: number; limit: number; pages: number } }>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: roleKeys.list(params),
    queryFn: () => apiGetPaginated<Role>(`/roles${toQueryString(params)}`),
    retry: false,
    ...options,
  });
}

export function useRole(id: string, enabled = true) {
  return useQuery({
    queryKey: roleKeys.detail(id),
    queryFn: () => apiGet<RoleDetail>(`/roles/${id}`),
    enabled: Boolean(id) && enabled,
    retry: false,
  });
}

export function usePermissions(enabled = true) {
  return useQuery({
    queryKey: roleKeys.permissions(),
    queryFn: () => apiGet<Permission[]>('/permissions'),
    enabled,
    retry: false,
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateRoleRequest) => apiPost<Role>('/roles', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: roleKeys.lists() });
    },
  });
}

export function useUpdateRolePermissions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      roleId,
      permissions,
    }: {
      roleId: string;
      permissions: UpdateRolePermissionsRequest;
    }) => apiPut<RoleDetail>(`/roles/${roleId}/permissions`, permissions),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: roleKeys.lists() });
      void queryClient.invalidateQueries({
        queryKey: roleKeys.detail(variables.roleId),
      });
    },
  });
}
