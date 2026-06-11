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
  AssignUserRoleRequest,
  CreateUserRequest,
  CreateUserResponse,
  MessageResponse,
  PaginationParams,
  UpdateUserRequest,
  User,
  UserDetail,
} from '@/lib/api/types';

export const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: (params: PaginationParams) => [...userKeys.lists(), params] as const,
  details: () => [...userKeys.all, 'detail'] as const,
  detail: (id: string) => [...userKeys.details(), id] as const,
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

export function useUsers(
  params: PaginationParams = { page: 1, limit: 20 },
  options?: Omit<
    UseQueryOptions<{ data: User[]; meta: { total: number; page: number; limit: number; pages: number } }>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: userKeys.list(params),
    queryFn: () => apiGetPaginated<User>(`/users${toQueryString(params)}`),
    retry: false,
    ...options,
  });
}

export function useUser(id: string, enabled = true) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: () => apiGet<UserDetail>(`/users/${id}`),
    enabled: Boolean(id) && enabled,
    retry: false,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateUserRequest) =>
      apiPost<CreateUserResponse>('/users', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}

export function useResendInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) =>
      apiPost<MessageResponse>(`/users/${userId}/resend-invitation`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      body,
    }: {
      userId: string;
      body: UpdateUserRequest;
    }) => apiPatch<User>(`/users/${userId}`, body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      void queryClient.invalidateQueries({
        queryKey: userKeys.detail(variables.userId),
      });
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) =>
      apiDelete<MessageResponse>(`/users/${userId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}

export function useAssignRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      roleId,
    }: {
      userId: string;
      roleId: string;
    }) =>
      apiPost<UserRoleAssignmentResponse>(`/users/${userId}/roles`, {
        roleId,
      } satisfies AssignUserRoleRequest),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      void queryClient.invalidateQueries({
        queryKey: userKeys.detail(variables.userId),
      });
    },
  });
}

export function useRevokeRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      roleId,
    }: {
      userId: string;
      roleId: string;
    }) => apiDelete<MessageResponse>(`/users/${userId}/roles/${roleId}`),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      void queryClient.invalidateQueries({
        queryKey: userKeys.detail(variables.userId),
      });
    },
  });
}

interface UserRoleAssignmentResponse {
  id: string;
  userId: string;
  roleId: string;
}
