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
