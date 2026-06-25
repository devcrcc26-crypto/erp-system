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
  return `${href}${buildRevisionTriggerQuery(params)}`;
}
