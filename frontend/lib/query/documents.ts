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
  apiPostForm,
} from '@/lib/api/client';
import type {
  DocumentDownloadUrl,
  DocumentRecord,
} from '@/lib/api/documents.types';
import type { PaginationParams } from '@/lib/api/types';

export const documentKeys = {
  all: ['documents'] as const,
  folderLists: () => [...documentKeys.all, 'folder'] as const,
  folderList: (folderId: string, params: PaginationParams) =>
    [...documentKeys.folderLists(), folderId, params] as const,
  downloadUrl: (documentId: string) =>
    [...documentKeys.all, 'download-url', documentId] as const,
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

export function useFolderDocuments(
  folderId: string,
  params: PaginationParams = { page: 1, limit: 20 },
  enabled = true,
  options?: Omit<
    UseQueryOptions<{
      data: DocumentRecord[];
      meta: { total: number; page: number; limit: number; pages: number };
    }>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: documentKeys.folderList(folderId, params),
    queryFn: () =>
      apiGetPaginated<DocumentRecord>(
        `/document-folders/${folderId}/documents${toQueryString(params)}`,
      ),
    enabled: Boolean(folderId) && enabled,
    retry: false,
    ...options,
  });
}

export function useDocumentDownloadUrl(documentId: string, enabled = true) {
  return useQuery({
    queryKey: documentKeys.downloadUrl(documentId),
    queryFn: () =>
      apiGet<DocumentDownloadUrl>(`/documents/${documentId}/download-url`),
    enabled: Boolean(documentId) && enabled,
    retry: false,
  });
}

export function useUploadDocumentToFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ folderId, file }: { folderId: string; file: File }) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<DocumentRecord>(
        `/document-folders/${folderId}/documents`,
        formData,
      );
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: documentKeys.folderLists(),
      });
      void queryClient.invalidateQueries({
        queryKey: documentKeys.folderList(variables.folderId, {
          page: 1,
          limit: 20,
        }),
      });
    },
  });
}
