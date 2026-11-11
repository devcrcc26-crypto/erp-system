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
  apiPostForm,
  downloadApiFile,
} from '@/lib/api/client';
import type {
  AssignUserRoleRequest,
  CreateUserRequest,
  CreateUserResponse,
  ImportCommitResult,
  ImportPreviewResult,
  MessageResponse,
  PaginationParams,
  UpdateUserRequest,
  User,
  UserDetail,
  UserProfileDocument,
  UsersQueryParams,
} from '@/lib/api/types';

/** Must match backend PaginationQueryDto @Max(100) on /users/directory. */
export const USER_DIRECTORY_PAGE_LIMIT = 100;

export const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: (params: UsersQueryParams) => [...userKeys.lists(), params] as const,
  directories: () => [...userKeys.all, 'directory'] as const,
  directory: (params: PaginationParams) => [...userKeys.directories(), params] as const,
  details: () => [...userKeys.all, 'detail'] as const,
  detail: (id: string) => [...userKeys.details(), id] as const,
  documents: (id: string) => [...userKeys.all, 'documents', id] as const,
  photoUrl: (id: string) => [...userKeys.all, 'photo-url', id] as const,
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

function toUsersQueryString(params: UsersQueryParams): string {
  const search = new URLSearchParams();
  if (params.page !== undefined) search.set('page', String(params.page));
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.sortBy) search.set('sortBy', params.sortBy);
  if (params.sortOrder) search.set('sortOrder', params.sortOrder);
  if (params.search) search.set('search', params.search);
  if (params.disciplineId) search.set('disciplineId', params.disciplineId);
  if (params.departmentId) search.set('departmentId', params.departmentId);
  if (params.positionId) search.set('positionId', params.positionId);
  if (params.isActive !== undefined) search.set('isActive', String(params.isActive));
  const query = search.toString();
  return query ? `?${query}` : '';
}

export function useUsers(
  params: UsersQueryParams = { page: 1, limit: 20 },
  options?: Omit<
    UseQueryOptions<{ data: User[]; meta: { total: number; page: number; limit: number; pages: number } }>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: userKeys.list(params),
    queryFn: () => apiGetPaginated<User>(`/users${toUsersQueryString(params)}`),
    retry: false,
    staleTime: 30_000,
    ...options,
  });
}

/**
 * Full company user list for client-side search, filter, sort, and export.
 * Scale target is ≤500 users per company - one load is faster than per-filter round trips.
 */
export function useAllUsers(
  options?: Omit<UseQueryOptions<User[]>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: [...userKeys.lists(), 'all'] as const,
    queryFn: fetchAllUsers,
    retry: false,
    staleTime: 60_000,
    ...options,
  });
}

/**
 * Loads every user in the company directory (paginates until complete).
 */
export async function fetchAllUsersDirectory(): Promise<User[]> {
  const limit = USER_DIRECTORY_PAGE_LIMIT;
  let page = 1;
  let pages = 1;
  const users: User[] = [];

  do {
    const result = await apiGetPaginated<User>(
      `/users/directory${toQueryString({ page, limit, sortBy: 'lastName', sortOrder: 'asc' })}`,
    );
    users.push(...result.data);
    pages = result.meta.pages;
    page += 1;
  } while (page <= pages);

  return users;
}

/**
 * Company user directory for assignment pickers - available with projects.view,
 * schedule.view, design_packages.view, or users.view.
 */
export function useUsersDirectory(
  params: PaginationParams = { page: 1, limit: 100 },
  options?: Omit<
    UseQueryOptions<{ data: User[]; meta: { total: number; page: number; limit: number; pages: number } }>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: userKeys.directory(params),
    queryFn: () =>
      apiGetPaginated<User>(`/users/directory${toQueryString(params)}`),
    retry: false,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

/**
 * Full company directory for name resolution in tables and drawers.
 */
export function useFullUsersDirectory(
  options?: Omit<UseQueryOptions<User[]>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: [...userKeys.directories(), 'all'] as const,
    queryFn: fetchAllUsersDirectory,
    retry: false,
    staleTime: 5 * 60 * 1000,
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

export function useUserDocuments(userId: string, enabled = true) {
  return useQuery({
    queryKey: userKeys.documents(userId),
    queryFn: () => apiGet<UserProfileDocument[]>(`/users/${userId}/documents`),
    enabled: Boolean(userId) && enabled,
    retry: false,
  });
}

export function useUploadUserDocuments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      files,
      labels,
    }: {
      userId: string;
      files: File[];
      labels: string[];
    }) => {
      const formData = new FormData();
      formData.append('labels', JSON.stringify(labels));
      for (const file of files) {
        formData.append('files', file);
      }
      return apiPostForm<UserProfileDocument[]>(`/users/${userId}/documents`, formData);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: userKeys.documents(variables.userId),
      });
    },
  });
}

export function useDeleteUserDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      documentId,
    }: {
      userId: string;
      documentId: string;
    }) => apiDelete<MessageResponse>(`/users/${userId}/documents/${documentId}`),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: userKeys.documents(variables.userId),
      });
    },
  });
}

/**
 * Presigned profile photo URL when the user has photoDocumentId set.
 */
export function useUserPhotoUrl(
  userId: string,
  photoDocumentId: string | null | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: userKeys.photoUrl(userId),
    queryFn: () =>
      apiGet<{ url: string; expiresIn: number }>(
        `/users/${userId}/photo/download-url`,
      ),
    enabled: Boolean(userId) && Boolean(photoDocumentId) && enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useUploadUserPhoto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, file }: { userId: string; file: File }) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<User>(`/users/${userId}/photo`, formData);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: userKeys.detail(variables.userId),
      });
      void queryClient.invalidateQueries({
        queryKey: userKeys.photoUrl(variables.userId),
      });
      void queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

export function useDeleteUserPhoto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) =>
      apiDelete<MessageResponse>(`/users/${userId}/photo`),
    onSuccess: (_data, userId) => {
      void queryClient.invalidateQueries({
        queryKey: userKeys.detail(userId),
      });
      void queryClient.invalidateQueries({
        queryKey: userKeys.photoUrl(userId),
      });
      void queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateUserRequest) =>
      apiPost<CreateUserResponse>('/users', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: userKeys.directories() });
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
      void queryClient.invalidateQueries({ queryKey: userKeys.directories() });
    },
  });
}

export function useAdminResetPassword() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) =>
      apiPost<{ temporaryPassword: string; mustChangePassword: true }>(
        `/users/${userId}/reset-password`,
      ),
    onSuccess: (_data, userId) => {
      void queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: userKeys.detail(userId) });
    },
  });
}

export function useUpdateLoginName() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      loginName,
    }: {
      userId: string;
      loginName: string;
    }) => apiPatch<User>(`/users/${userId}/login-name`, { loginName }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      void queryClient.invalidateQueries({
        queryKey: userKeys.detail(variables.userId),
      });
    },
  });
}

export function useSetLoginNameToFullName() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) =>
      apiPost<User>(`/users/${userId}/login-name/use-full-name`),
    onSuccess: (_data, userId) => {
      void queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: userKeys.detail(userId) });
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
      void queryClient.invalidateQueries({ queryKey: userKeys.directories() });
    },
  });
}

export function useAssignRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      roleId,
      isPrimary,
    }: {
      userId: string;
      roleId: string;
      isPrimary?: boolean;
    }) =>
      apiPost<UserRoleAssignmentResponse>(`/users/${userId}/roles`, {
        roleId,
        ...(isPrimary === undefined ? {} : { isPrimary }),
      } satisfies AssignUserRoleRequest),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      void queryClient.invalidateQueries({
        queryKey: userKeys.detail(variables.userId),
      });
    },
  });
}

export function useSetPrimaryRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      roleId,
    }: {
      userId: string;
      roleId: string;
    }) =>
      apiPatch<UserDetail>(`/users/${userId}/primary-role`, { roleId }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      void queryClient.invalidateQueries({
        queryKey: userKeys.detail(variables.userId),
      });
    },
  });
}

export function useImportPreview() {
  return useMutation({
    mutationFn: async (file: File): Promise<ImportPreviewResult> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<ImportPreviewResult>('/users/import/preview', formData);
    },
  });
}

export function useImportUsers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      file,
      sendInvitations,
    }: {
      file: File;
      sendInvitations: boolean;
    }): Promise<ImportCommitResult> => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sendInvitations', String(sendInvitations));
      return apiPostForm<ImportCommitResult>('/users/import', formData);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: userKeys.directories() });
    },
  });
}

export async function downloadUserImportTemplate(): Promise<void> {
  await downloadApiFile('/users/import/template', 'user-import-template.xlsx');
}

/**
 * Loads every user in the company for export (paginates until complete).
 */
export async function fetchAllUsers(): Promise<User[]> {
  const limit = 100;
  let page = 1;
  let pages = 1;
  const users: User[] = [];

  do {
    const result = await apiGetPaginated<User>(
      `/users${toQueryString({ page, limit, sortBy: 'lastName', sortOrder: 'asc' })}`,
    );
    users.push(...result.data);
    pages = result.meta.pages;
    page += 1;
  } while (page <= pages);

  return users;
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
