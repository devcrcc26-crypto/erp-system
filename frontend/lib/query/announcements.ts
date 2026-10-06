'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  AnnouncementAudienceInput,
  AnnouncementAudienceOptions,
  AnnouncementRecipientRow,
  AnnouncementsSummary,
  AnnouncementWritePayload,
  ListManagedAnnouncementsParams,
  ListMyAnnouncementsParams,
  ListRecipientsParams,
  ManagedAnnouncementDetail,
  ManagedAnnouncementListItem,
  MyAnnouncementDetail,
  MyAnnouncementSummary,
} from '@/lib/api/announcements.types';
import { notificationKeys } from '@/lib/query/notifications';

const MY = '/announcements';
const HR = '/hr/announcements';

export const announcementKeys = {
  all: ['announcements'] as const,
  summary: () => [...announcementKeys.all, 'summary'] as const,
  mine: (params: ListMyAnnouncementsParams) => [...announcementKeys.all, 'mine', params] as const,
  myDetail: (id: string) => [...announcementKeys.all, 'my-detail', id] as const,
  managed: () => [...announcementKeys.all, 'managed'] as const,
  managedList: (params: ListManagedAnnouncementsParams) =>
    [...announcementKeys.managed(), 'list', params] as const,
  managedDetail: (id: string) => [...announcementKeys.managed(), 'detail', id] as const,
  recipients: (id: string, params: ListRecipientsParams) =>
    [...announcementKeys.managed(), 'recipients', id, params] as const,
  audienceOptions: () => [...announcementKeys.managed(), 'audience-options'] as const,
  audienceCount: (input: AnnouncementAudienceInput) =>
    [...announcementKeys.managed(), 'audience-count', input] as const,
};

function query(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

// ─── Recipient side ─────────────────────────────────────────────────────────

/** Badge, urgent banner, acknowledgement modal, What's new and dashboard data. */
export function useAnnouncementsSummary(enabled = true) {
  return useQuery({
    queryKey: announcementKeys.summary(),
    queryFn: () => apiGet<AnnouncementsSummary>(`${MY}/summary`),
    enabled,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useMyAnnouncements(params: ListMyAnnouncementsParams, enabled = true) {
  return useQuery({
    queryKey: announcementKeys.mine(params),
    queryFn: () => apiGetPaginated<MyAnnouncementSummary>(`${MY}${query(params)}`),
    enabled,
    placeholderData: (previous) => previous,
  });
}

export function useMyAnnouncement(id: string, enabled = true) {
  return useQuery({
    queryKey: announcementKeys.myDetail(id),
    queryFn: () => apiGet<MyAnnouncementDetail>(`${MY}/${id}`),
    enabled: enabled && Boolean(id),
    retry: false,
  });
}

function useInvalidateMine() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: announcementKeys.all });
    void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
  };
}

export function useMarkAnnouncementRead() {
  const invalidate = useInvalidateMine();
  return useMutation({
    mutationFn: (id: string) =>
      apiPost<{ readAt: string | null; acknowledgedAt: string | null }>(`${MY}/${id}/read`),
    onSuccess: invalidate,
  });
}

export function useMarkAnnouncementsRead() {
  const invalidate = useInvalidateMine();
  return useMutation({
    mutationFn: (ids: string[]) => apiPost<{ updated: number }>(`${MY}/read`, { ids }),
    onSuccess: invalidate,
  });
}

export function useAcknowledgeAnnouncement() {
  const invalidate = useInvalidateMine();
  return useMutation({
    mutationFn: (id: string) =>
      apiPost<{ readAt: string | null; acknowledgedAt: string | null }>(`${MY}/${id}/acknowledge`),
    onSuccess: invalidate,
  });
}

/** Opens an attachment in a new tab through a short-lived signed URL. */
export async function openAnnouncementAttachment(
  announcementId: string,
  documentId: string,
  scope: 'mine' | 'managed' = 'mine',
): Promise<void> {
  const base = scope === 'mine' ? MY : HR;
  const { url } = await apiGet<{ url: string; name: string }>(
    `${base}/${announcementId}/attachments/${documentId}/download-url`,
  );
  window.open(url, '_blank', 'noopener,noreferrer');
}

// ─── HR / admin management ──────────────────────────────────────────────────

export function useManagedAnnouncements(params: ListManagedAnnouncementsParams, enabled = true) {
  return useQuery({
    queryKey: announcementKeys.managedList(params),
    queryFn: () => apiGetPaginated<ManagedAnnouncementListItem>(`${HR}${query(params)}`),
    enabled,
    placeholderData: (previous) => previous,
  });
}

export function useManagedAnnouncement(id: string, enabled = true) {
  return useQuery({
    queryKey: announcementKeys.managedDetail(id),
    queryFn: () => apiGet<ManagedAnnouncementDetail>(`${HR}/${id}`),
    enabled: enabled && Boolean(id),
    retry: false,
  });
}

export function useAnnouncementRecipients(id: string, params: ListRecipientsParams, enabled = true) {
  return useQuery({
    queryKey: announcementKeys.recipients(id, params),
    queryFn: () =>
      apiGetPaginated<AnnouncementRecipientRow>(`${HR}/${id}/recipients${query(params)}`),
    enabled: enabled && Boolean(id),
    placeholderData: (previous) => previous,
  });
}

export function useAnnouncementAudienceOptions(enabled = true) {
  return useQuery({
    queryKey: announcementKeys.audienceOptions(),
    queryFn: () => apiGet<AnnouncementAudienceOptions>(`${HR}/audience-options`),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useAnnouncementAudienceCount(input: AnnouncementAudienceInput, enabled = true) {
  return useQuery({
    queryKey: announcementKeys.audienceCount(input),
    queryFn: () => apiPost<{ count: number }>(`${HR}/audience-preview`, input),
    enabled,
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });
}

function useInvalidateManaged() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: announcementKeys.all });
  };
}

export function useCreateAnnouncement() {
  const invalidate = useInvalidateManaged();
  return useMutation({
    mutationFn: (payload: AnnouncementWritePayload) =>
      apiPost<ManagedAnnouncementDetail>(HR, payload),
    onSuccess: invalidate,
  });
}

export function useUpdateAnnouncement(id: string) {
  const invalidate = useInvalidateManaged();
  return useMutation({
    mutationFn: (payload: AnnouncementWritePayload) =>
      apiPatch<ManagedAnnouncementDetail>(`${HR}/${id}`, payload),
    onSuccess: invalidate,
  });
}

export function usePublishAnnouncement() {
  const invalidate = useInvalidateManaged();
  return useMutation({
    mutationFn: ({ id, publishAt }: { id: string; publishAt?: string | null }) =>
      apiPost<ManagedAnnouncementDetail>(`${HR}/${id}/publish`, { publishAt: publishAt ?? null }),
    onSuccess: invalidate,
  });
}

export function useUnscheduleAnnouncement() {
  const invalidate = useInvalidateManaged();
  return useMutation({
    mutationFn: (id: string) => apiPost<ManagedAnnouncementDetail>(`${HR}/${id}/unschedule`),
    onSuccess: invalidate,
  });
}

export function useArchiveAnnouncement() {
  const invalidate = useInvalidateManaged();
  return useMutation({
    mutationFn: (id: string) => apiPost<ManagedAnnouncementDetail>(`${HR}/${id}/archive`),
    onSuccess: invalidate,
  });
}

export function useDeleteAnnouncement() {
  const invalidate = useInvalidateManaged();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`${HR}/${id}`),
    onSuccess: invalidate,
  });
}

export function useRemindUnreadAnnouncement() {
  const invalidate = useInvalidateManaged();
  return useMutation({
    mutationFn: (id: string) => apiPost<{ notified: number }>(`${HR}/${id}/remind-unread`),
    onSuccess: invalidate,
  });
}

/** Uploads attachments (field "files"); used right after creating a draft. */
export function uploadAnnouncementFiles(
  id: string,
  files: File[],
): Promise<ManagedAnnouncementDetail> {
  const form = new FormData();
  for (const file of files) {
    form.append('files', file);
  }
  return apiPostForm<ManagedAnnouncementDetail>(`${HR}/${id}/attachments`, form);
}

export function useDeleteAnnouncementAttachment(id: string) {
  const invalidate = useInvalidateManaged();
  return useMutation({
    mutationFn: (documentId: string) =>
      apiDelete<ManagedAnnouncementDetail>(`${HR}/${id}/attachments/${documentId}`),
    onSuccess: invalidate,
  });
}

export async function downloadAnnouncementStats(id: string, number: string): Promise<void> {
  await downloadApiFile(`${HR}/${id}/export`, `Announcement_${number}_read_stats.xlsx`);
}
