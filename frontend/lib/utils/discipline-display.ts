export function formatDisciplineNumber(
  index: number | null | undefined,
): string {
  if (index == null) return '-';
  if (index < 10) return String(index).padStart(2, '0');
  return String(index);
}

export function formatDisciplineLabel(
  index: number | null | undefined,
): string {
  return `Discipline ${formatDisciplineNumber(index)}`;
}
