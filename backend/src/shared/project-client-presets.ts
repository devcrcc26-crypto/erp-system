/**
 * Suggested project client names - DB column remains free-text; any value is allowed.
 * Keys must match display labels exactly.
 */
export const PROJECT_CLIENT_PRESET_VALUES = [
  'CCECC Ethiopia',
  'CCECC Djibouti',
  'CCECC Kenya',
] as const;

export type ProjectClientPreset =
  (typeof PROJECT_CLIENT_PRESET_VALUES)[number];

export const PROJECT_CLIENT_PRESET_OPTIONS =
  PROJECT_CLIENT_PRESET_VALUES.map((value) => ({
    value,
    label: value,
  }));

export const PROJECT_CLIENT_MAX_LENGTH = 200;

/** Normalizes client input: trim; empty string becomes undefined (NULL in DB). */
export function normalizeProjectClientInput(
  value: string | null | undefined,
): string | undefined {
  if (value == null) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
