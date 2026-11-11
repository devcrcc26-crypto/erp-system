/**
 * Resolves displayed project progress: prefer live task averages over the stored field.
 */
export function resolveProjectProgressPct(
  storedOverallProgressPct: number,
  taskAverageProgressPct: number | null | undefined,
): number {
  if (
    taskAverageProgressPct != null &&
    Number.isFinite(taskAverageProgressPct)
  ) {
    return clampProgressPct(taskAverageProgressPct);
  }
  return clampProgressPct(storedOverallProgressPct);
}

/**
 * Clamps a percentage to 0–100 and rounds to a whole number.
 */
export function clampProgressPct(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Averages per-project progress values for portfolio metrics.
 */
export function averageProjectProgressPct(
  values: readonly number[],
): number | null {
  if (values.length === 0) {
    return null;
  }
  const sum = values.reduce((total, value) => total + value, 0);
  return clampProgressPct(sum / values.length);
}
