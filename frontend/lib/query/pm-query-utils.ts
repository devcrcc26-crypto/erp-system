import type { PaginationParams } from '@/lib/api/types';

export type QueryParamValue = string | number | boolean | undefined | null;

export type QueryStringParams = PaginationParams & {
  [key: string]: QueryParamValue | undefined;
};

export function toQueryString<P extends PaginationParams>(
  params: P = {} as P,
): string {
  const search = new URLSearchParams();

  if (params.page !== undefined) {
    search.set('page', String(params.page));
  }
  if (params.limit !== undefined) {
    search.set('limit', String(params.limit));
  }
  if (params.sortBy) {
    search.set('sortBy', params.sortBy);
  }
  if (params.sortOrder) {
    search.set('sortOrder', params.sortOrder);
  }

  for (const [key, value] of Object.entries(params)) {
    if (['page', 'limit', 'sortBy', 'sortOrder'].includes(key)) {
      continue;
    }
    if (value === undefined || value === null || value === '') {
      continue;
    }
    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `?${query}` : '';
}

export function projectPath(projectId: string, resource?: string): string {
  const base = `/projects/${projectId}`;
  return resource ? `${base}/${resource}` : base;
}
