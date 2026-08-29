/** Allowed position grade levels (1–5). */
export const POSITION_GRADE_VALUES = ['1', '2', '3', '4', '5'] as const;

export type PositionGrade = (typeof POSITION_GRADE_VALUES)[number];

export function isPositionGrade(value: string | null | undefined): value is PositionGrade {
  return (
    typeof value === 'string' &&
    (POSITION_GRADE_VALUES as readonly string[]).includes(value)
  );
}

export function formatPositionGrade(
  grade: string | null | undefined,
  t: (key: string) => string,
): string {
  if (!grade) {
    return '—';
  }
  if (isPositionGrade(grade)) {
    return t(`pages.positions.grades.${grade}`);
  }
  return grade;
}
