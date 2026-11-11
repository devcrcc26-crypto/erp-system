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
import { useAuthStore } from '@/stores/auth.store';
import { ApiRequestError } from '@/lib/api/errors';

export const notificationKeys = {
  all: ['notifications'] as const,
  forUser: (userId: string) => [...notificationKeys.all, userId] as const,
  lists: (userId: string) =>
    [...notificationKeys.forUser(userId), 'list'] as const,
  list: (
    userId: string,
    params: PaginationParams & { unreadOnly?: boolean },
  ) => [...notificationKeys.lists(userId), params] as const,
  unreadCount: (userId: string) =>
    [...notificationKeys.forUser(userId), 'unread-count'] as const,
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
  const userId = useAuthStore((state) => state.user?.id ?? '');

  return useQuery({
    queryKey: notificationKeys.list(userId, params),
    queryFn: ({ signal }) =>
      apiGetPaginated<InAppNotification>(
        `/notifications${toQueryString(params)}`,
        { signal },
      ),
    enabled: enabled && Boolean(userId),
    retry: false,
    ...options,
  });
}

export function useUnreadNotificationCount(enabled = true) {
  const userId = useAuthStore((state) => state.user?.id ?? '');

  return useQuery({
    queryKey: notificationKeys.unreadCount(userId),
    queryFn: ({ signal }) =>
      apiGet<UnreadNotificationCount>('/notifications/unread-count', {
        signal,
      }),
    enabled: enabled && Boolean(userId),
    retry: false,
    refetchInterval: enabled && Boolean(userId) ? 60_000 : false,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id ?? '');

  return useMutation({
    mutationFn: async (notificationId: string) => {
      try {
        return await apiPatch<InAppNotification>(
          `/notifications/${notificationId}/read`,
        );
      } catch (error) {
        // Stale inbox rows (e.g. previous user cache) should not block navigation.
        if (error instanceof ApiRequestError && error.status === 404) {
          return null;
        }
        throw error;
      }
    },
    onSuccess: () => {
      if (!userId) {
        void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
        return;
      }
      void queryClient.invalidateQueries({
        queryKey: notificationKeys.forUser(userId),
      });
    },
  });
}

export function useMarkNotificationsReadForRoute() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id ?? '');

  return useMutation({
    mutationFn: (path: string) =>
      apiPatch<{ updated: number }>('/notifications/read-for-route', {
        path,
      }),
    onSuccess: (result) => {
      if (result.updated <= 0) {
        return;
      }
      if (!userId) {
        void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
        return;
      }
      void queryClient.invalidateQueries({
        queryKey: notificationKeys.forUser(userId),
      });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id ?? '');

  return useMutation({
    mutationFn: () => apiPatch<{ updated: number }>('/notifications/read-all'),
    onSuccess: () => {
      if (!userId) {
        void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
        return;
      }
      void queryClient.invalidateQueries({
        queryKey: notificationKeys.forUser(userId),
      });
    },
  });
}
