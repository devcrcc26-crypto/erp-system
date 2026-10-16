export type QueryParamValue = string | number | boolean | undefined | null;

/** Loose map for query builders - callers may pass domain-specific filters. */
export type QueryStringParams = Record<string, QueryParamValue | undefined>;

/**
 * Builds a `?a=1&b=2` string from any plain params object.
 * Accepts `object` so list DTOs (pagination + filters) type-check without casts.
 */
export function toQueryString(params: object = {}): string {
  const search = new URLSearchParams();
  const entries = Object.entries(params as Record<string, unknown>);

  for (const [key, value] of entries) {
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
