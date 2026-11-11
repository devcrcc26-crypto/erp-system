export type RevisionTriggerSource =
  | 'RFI'
  | 'CHANGE_REQUEST'
  | 'SUBMITTAL_REVIEW';

export interface RevisionTriggerParams {
  triggerSource: RevisionTriggerSource;
  triggerEntityId: string;
}

const VALID_SOURCES = new Set<RevisionTriggerSource>([
  'RFI',
  'CHANGE_REQUEST',
  'SUBMITTAL_REVIEW',
]);

/**
 * Parses revision-trigger context from URL search params.
 */
export function parseRevisionTriggerParams(
  searchParams: URLSearchParams | { get: (key: string) => string | null },
): RevisionTriggerParams | null {
  const triggerSource = searchParams.get('triggerSource');
  const triggerEntityId = searchParams.get('triggerEntityId')?.trim();

  if (
    !triggerSource ||
    !triggerEntityId ||
    !VALID_SOURCES.has(triggerSource as RevisionTriggerSource)
  ) {
    return null;
  }

  return {
    triggerSource: triggerSource as RevisionTriggerSource,
    triggerEntityId,
  };
}

/**
 * Serializes revision-trigger context for URL query strings.
 */
export function buildRevisionTriggerQuery(
  params: RevisionTriggerParams,
): string {
  const qs = new URLSearchParams({
    triggerSource: params.triggerSource,
    triggerEntityId: params.triggerEntityId,
  });
  return `?${qs.toString()}`;
}

/**
 * Appends revision-trigger query params to a path when context is present.
 */
export function appendRevisionTriggerQuery(
  href: string,
  params: RevisionTriggerParams | null,
): string {
  if (!params) {
    return href;
  }
  const separator = href.includes('?') ? '&' : '?';
  return `${href}${separator}${buildRevisionTriggerQuery(params).slice(1)}`;
}

/**
 * Builds the engineering document detail route with optional discipline and trigger context.
 */
export function buildEngineeringDocumentDetailHref(
  projectId: string,
  engineeringDocumentId: string,
  options?: {
    taskDisciplineId?: string;
    revisionTrigger?: RevisionTriggerParams | null;
  },
): string {
  const params = new URLSearchParams();
  if (options?.taskDisciplineId) {
    params.set('taskDisciplineId', options.taskDisciplineId);
  }
  if (options?.revisionTrigger) {
    params.set('triggerSource', options.revisionTrigger.triggerSource);
    params.set('triggerEntityId', options.revisionTrigger.triggerEntityId);
  }

  const query = params.toString();
  const base = `/projects/${projectId}/engineering-documents/${engineeringDocumentId}`;
  return query ? `${base}?${query}` : base;
}
