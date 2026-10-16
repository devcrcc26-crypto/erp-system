import type { SubmittalItem } from '@/lib/api/project-management.types';

/**
 * Formats list cell text for linked subtasks: first two codes, then "+N more".
 */
export function formatSubmittalItemCodesSummary(
  items: Pick<SubmittalItem, 'fullSubtaskCode' | 'packageCode'>[] | undefined,
): string {
  const codes = (items ?? [])
    .map((item) => item.fullSubtaskCode ?? item.packageCode)
    .filter((code): code is string => Boolean(code));
  if (codes.length === 0) {
    return '-';
  }
  if (codes.length <= 2) {
    return codes.join(', ');
  }
  return `${codes.slice(0, 2).join(', ')} +${codes.length - 2} more`;
}

/**
 * Full subtask display code from overseas / discipline / subtask indexes.
 * Example: 26-ETO-035-01-003
 */
export function formatFullSubtaskCode(parts: {
  overseasTaskNumber?: string | null;
  disciplineIndex?: number | null;
  subtaskIndex?: number | null;
  packageCode?: string | null;
}): string | null {
  const overseas = parts.overseasTaskNumber?.trim();
  if (!overseas) {
    return parts.packageCode ?? null;
  }
  const discIdx = String(parts.disciplineIndex ?? 0).padStart(2, '0');
  const subIdx = String(parts.subtaskIndex ?? 0).padStart(3, '0');
  return `${overseas}-${discIdx}-${subIdx}`;
}
