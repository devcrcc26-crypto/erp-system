/**
 * Formats the discipline number: {overseasTaskNumber}-{disciplineIndex:02}.
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
 * Primary label for a task discipline row (number, else catalog name).
 */
export function resolveDisciplineDisplayLabel(discipline: {
  disciplineName: string;
  overseasTaskNumber?: string | null;
  disciplineIndex?: number | null;
  disciplineNumber?: string | null;
}): string {
  return (
    discipline.disciplineNumber ??
    formatDisciplineNumber(
      discipline.overseasTaskNumber,
      discipline.disciplineIndex,
    ) ??
    discipline.disciplineName
  );
}
