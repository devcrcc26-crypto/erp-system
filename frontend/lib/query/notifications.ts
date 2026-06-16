'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { apiGet, apiGetPaginated, apiPatch } from '@/lib/api/client';
import type {
  InAppNotification,
  UnreadNotificationCount,
} from '@/lib/api/documents.types';
import type { PaginationParams } from '@/lib/api/types';

export const notificationKeys = {
  all: ['notifications'] as const,
  lists: () => [...notificationKeys.all, 'list'] as const,
  list: (params: PaginationParams & { unreadOnly?: boolean }) =>
    [...notificationKeys.lists(), params] as const,
  unreadCount: () => [...notificationKeys.all, 'unread-count'] as const,
};

function toQueryString(
  params: PaginationParams & { unreadOnly?: boolean },
): string {
  const search = new URLSearchParams();
  if (params.page !== undefined) search.set('page', String(params.page));
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.sortBy) search.set('sortBy', params.sortBy);
  if (params.sortOrder) search.set('sortOrder', params.sortOrder);
  if (params.unreadOnly) search.set('unreadOnly', 'true');
  const query = search.toString();
  return query ? `?${query}` : '';
}

export function useNotifications(
  params: PaginationParams & { unreadOnly?: boolean } = {
    page: 1,
    limit: 10,
  },
  enabled = true,
  options?: Omit<
    UseQueryOptions<{
      data: InAppNotification[];
      meta: { total: number; page: number; limit: number; pages: number };
    }>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: notificationKeys.list(params),
    queryFn: () =>
      apiGetPaginated<InAppNotification>(
        `/notifications${toQueryString(params)}`,
      ),
    enabled,
    retry: false,
    ...options,
  });
}

export function useUnreadNotificationCount(enabled = true) {
  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: () => apiGet<UnreadNotificationCount>('/notifications/unread-count'),
    enabled,
    retry: false,
    refetchInterval: enabled ? 60_000 : false,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) =>
      apiPatch<InAppNotification>(`/notifications/${notificationId}/read`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiPatch<{ updated: number }>('/notifications/read-all'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}
