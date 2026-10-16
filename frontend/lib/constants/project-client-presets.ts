/**
 * Suggested project client names - must match backend preset labels.
 * Users may enter other company names; the API stores free text.
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
