/**
 * Formats the discipline number: {overseasTaskNumber}-{disciplineIndex:02}.
 * Example: OS-2024-100-01
 */
export function formatDisciplineNumber(
  overseasTaskNumber: string | null | undefined,
  disciplineIndex: number | null | undefined,
): string | null {
  const overseas = overseasTaskNumber?.trim();
  if (!overseas || disciplineIndex == null) {
    return null;
  }
  return `${overseas}-${String(disciplineIndex).padStart(2, '0')}`;
}

/**
 * Formats the subtask number: {overseasTaskNumber}-{disciplineIndex:02}-{subtaskIndex:02}.
 * Example: OS-2024-100-01-03
 */
export function formatSubtaskNumber(
  overseasTaskNumber: string | null | undefined,
  disciplineIndex: number | null | undefined,
  subtaskIndex: number | null | undefined,
): string | null {
  const disciplineNumber = formatDisciplineNumber(
    overseasTaskNumber,
    disciplineIndex,
  );
  if (!disciplineNumber || subtaskIndex == null) {
    return null;
  }
  return `${disciplineNumber}-${String(subtaskIndex).padStart(2, '0')}`;
}

/**
 * Full subtask code for change requests: {overseas}-{discipline:02}-{subtask:03}.
 * Example: 26-ETO-035-01-003
 */
export function formatDesignPackageFullCode(
  overseasTaskNumber: string | null | undefined,
  disciplineIndex: number | null | undefined,
  subtaskIndex: number | null | undefined,
): string {
  const overseas = overseasTaskNumber?.trim() ?? '';
  const discIdx = String(disciplineIndex ?? 0).padStart(2, '0');
  const subIdx = String(subtaskIndex ?? 0).padStart(3, '0');
  return `${overseas}-${discIdx}-${subIdx}`;
}
