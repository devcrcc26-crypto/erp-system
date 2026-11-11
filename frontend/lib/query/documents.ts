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
  DocumentFolder,
  DocumentRecord,
  FolderContextType,
  ProjectDocumentListParams,
  ProjectDocumentRecord,
} from '@/lib/api/documents.types';
import type { PaginationMeta, PaginationParams } from '@/lib/api/types';

export const DOCUMENT_FOLDER_PAGE_SIZE = 100;

type FolderListParams = PaginationParams & {
  contextType?: FolderContextType;
  contextId?: string;
  parentId?: string;
};

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

export const documentKeys = {
  all: ['documents'] as const,
  folders: () => [...documentKeys.all, 'folders'] as const,
  folderSearch: (params: FolderListParams) =>
    [...documentKeys.folders(), params] as const,
  folderDocuments: () => [...documentKeys.all, 'folder-documents'] as const,
  folderDocumentList: (folderId: string, params: PaginationParams) =>
    [...documentKeys.folderDocuments(), folderId, params] as const,
  downloadUrl: (documentId: string) =>
    [...documentKeys.all, 'download-url', documentId] as const,
  detail: (documentId: string) =>
    [...documentKeys.all, 'detail', documentId] as const,
  projectDocuments: (projectId: string) =>
    [...documentKeys.all, 'project', projectId] as const,
  projectDocumentList: (
    projectId: string,
    params: ProjectDocumentListParams,
  ) => [...documentKeys.projectDocuments(projectId), params] as const,
};

function toProjectDocumentQueryString(params: ProjectDocumentListParams): string {
  const search = new URLSearchParams();
  if (params.page !== undefined) search.set('page', String(params.page));
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.sortBy) search.set('sortBy', params.sortBy);
  if (params.sortOrder) search.set('sortOrder', params.sortOrder);
  if (params.search?.trim()) search.set('search', params.search.trim());
  if (params.folderContextType) {
    search.set('folderContextType', params.folderContextType);
  }
  if (params.taskDisciplineId) {
    search.set('taskDisciplineId', params.taskDisciplineId);
  }
  if (params.fileType) search.set('fileType', params.fileType);
  if (params.uploadedFrom) search.set('uploadedFrom', params.uploadedFrom);
  if (params.uploadedTo) search.set('uploadedTo', params.uploadedTo);
  const query = search.toString();
  return query ? `?${query}` : '';
}

function toQueryString(params: FolderListParams): string {
  const search = new URLSearchParams();
  if (params.page !== undefined) search.set('page', String(params.page));
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.sortBy) search.set('sortBy', params.sortBy);
  if (params.sortOrder) search.set('sortOrder', params.sortOrder);
  if (params.contextType) search.set('contextType', params.contextType);
  if (params.contextId) search.set('contextId', params.contextId);
  if (params.parentId) search.set('parentId', params.parentId);
  const query = search.toString();
  return query ? `?${query}` : '';
}

export function useDocumentFolders(
  params: FolderListParams = { page: 1, limit: DOCUMENT_FOLDER_PAGE_SIZE },
  enabled = true,
  options?: Omit<
    UseQueryOptions<PaginatedResult<DocumentFolder>>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: documentKeys.folderSearch(params),
    queryFn: () =>
      apiGetPaginated<DocumentFolder>(
        `/document-folders${toQueryString(params)}`,
      ),
    enabled,
    retry: false,
    ...options,
  });
}

export function useProjectDocumentFolder(
  projectId: string,
  enabled = true,
  options?: Omit<
    UseQueryOptions<PaginatedResult<DocumentFolder>>,
    'queryKey' | 'queryFn'
  >,
) {
  return useDocumentFolders(
    {
      page: 1,
      limit: DOCUMENT_FOLDER_PAGE_SIZE,
      contextType: 'PROJECT',
      contextId: projectId,
      sortBy: 'createdAt',
      sortOrder: 'asc',
    },
    Boolean(projectId) && enabled,
    options,
  );
}

export function useProjectDocuments(
  projectId: string,
  params: ProjectDocumentListParams = { page: 1, limit: 20 },
  enabled = true,
  options?: Omit<
    UseQueryOptions<PaginatedResult<ProjectDocumentRecord>>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: documentKeys.projectDocumentList(projectId, params),
    queryFn: () =>
      apiGetPaginated<ProjectDocumentRecord>(
        `/document-folders/project/${projectId}/documents${toProjectDocumentQueryString(params)}`,
      ),
    enabled: Boolean(projectId) && enabled,
    retry: false,
    ...options,
  });
}

export function useFolderDocuments(
  folderId: string,
  params: PaginationParams = { page: 1, limit: 20 },
  enabled = true,
  options?: Omit<
    UseQueryOptions<PaginatedResult<DocumentRecord>>,
    'queryKey' | 'queryFn'
  >,
) {
  const queryParams: PaginationParams = params;
  return useQuery({
    queryKey: documentKeys.folderDocumentList(folderId, params),
    queryFn: () => {
      const search = new URLSearchParams();
      if (queryParams.page !== undefined) {
        search.set('page', String(queryParams.page));
      }
      if (queryParams.limit !== undefined) {
        search.set('limit', String(queryParams.limit));
      }
      if (queryParams.sortBy) search.set('sortBy', queryParams.sortBy);
      if (queryParams.sortOrder) search.set('sortOrder', queryParams.sortOrder);
      const query = search.toString();
      return apiGetPaginated<DocumentRecord>(
        `/document-folders/${folderId}/documents${query ? `?${query}` : ''}`,
      );
    },
    enabled: Boolean(folderId) && enabled,
    retry: false,
    ...options,
  });
}

/**
 * Core document metadata (name, MIME type, size) - no signed URL is issued.
 */
export function useDocumentMetadata(documentId: string, enabled = true) {
  return useQuery({
    queryKey: documentKeys.detail(documentId),
    queryFn: () => apiGet<DocumentRecord>(`/documents/${documentId}`),
    enabled: Boolean(documentId) && enabled,
    staleTime: 5 * 60_000,
    retry: false,
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
        queryKey: documentKeys.folderDocuments(),
      });
      void queryClient.invalidateQueries({
        queryKey: documentKeys.folderDocumentList(variables.folderId, {
          page: 1,
          limit: 20,
        }),
      });
      void queryClient.invalidateQueries({
        queryKey: documentKeys.all,
      });
    },
  });
}
