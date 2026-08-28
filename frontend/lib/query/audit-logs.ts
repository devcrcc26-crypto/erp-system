'use client';

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { apiGet, apiGetPaginated } from '@/lib/api/client';
import type { AuditLog, AuditLogQueryParams, AuditLogStats } from '@/lib/api/types';

export const auditLogKeys = {
  all: ['audit-logs'] as const,
  lists: () => [...auditLogKeys.all, 'list'] as const,
  list: (params: AuditLogQueryParams) => [...auditLogKeys.lists(), params] as const,
  details: () => [...auditLogKeys.all, 'detail'] as const,
  detail: (id: string) => [...auditLogKeys.details(), id] as const,
  stats: () => [...auditLogKeys.all, 'stats'] as const,
};

function toQueryString(params: AuditLogQueryParams): string {
  const search = new URLSearchParams();
  if (params.page !== undefined) search.set('page', String(params.page));
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.sortBy) search.set('sortBy', params.sortBy);
  if (params.sortOrder) search.set('sortOrder', params.sortOrder);
  if (params.module) search.set('module', params.module);
  if (params.action) search.set('action', params.action);
  if (params.userId) search.set('userId', params.userId);
  if (params.recordType) search.set('recordType', params.recordType);
  if (params.recordId) search.set('recordId', params.recordId);
  if (params.dateFrom) search.set('dateFrom', params.dateFrom);
  if (params.dateTo) search.set('dateTo', params.dateTo);
  const query = search.toString();
  return query ? `?${query}` : '';
}

export function useAuditLogs(
  params: AuditLogQueryParams = { page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' },
  options?: Omit<
    UseQueryOptions<{
      data: AuditLog[];
      meta: { total: number; page: number; limit: number; pages: number };
    }>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: auditLogKeys.list(params),
    queryFn: () => apiGetPaginated<AuditLog>(`/audit-logs${toQueryString(params)}`),
    retry: false,
    staleTime: 60 * 1000,
    ...options,
  });
}

export function useAuditLog(id: string, enabled = true) {
  return useQuery({
    queryKey: auditLogKeys.detail(id),
    queryFn: () => apiGet<AuditLog>(`/audit-logs/${id}`),
    enabled: Boolean(id) && enabled,
    retry: false,
    staleTime: 60 * 1000,
  });
}

export function useAuditLogStats(enabled = true) {
  return useQuery({
    queryKey: auditLogKeys.stats(),
    queryFn: () => apiGet<AuditLogStats>('/audit-logs/stats/summary'),
    enabled,
    retry: false,
    staleTime: 60 * 1000,
  });
}
