/**
 * User engineering discipline - backend source of truth; keys must match Prisma enum.
 */
export const USER_DISCIPLINE_VALUES = [
  'HIGHWAY',
  'HYDROLOGY',
  'STRUCTURE_ROAD',
  'GEOLOGICAL',
  'PAVEMENT_MATERIAL',
  'SURVEY',
  'ARCHITECTURE',
  'INTERIOR_DESIGN',
  'LANDSCAPE_DESIGN',
  'STRUCTURE_BUILDING',
  'SANITARY',
  'ELECTRICAL_ICT',
  'MECHANICAL',
] as const;

export type UserDiscipline = (typeof USER_DISCIPLINE_VALUES)[number];

export interface UserDisciplineDefinition {
  value: UserDiscipline;
  label: string;
}

export const USER_DISCIPLINE_DEFINITIONS: readonly UserDisciplineDefinition[] =
  [
    { value: 'HIGHWAY', label: 'Highway' },
    { value: 'HYDROLOGY', label: 'Hydrology' },
    { value: 'STRUCTURE_ROAD', label: 'Structure(Road)' },
    { value: 'GEOLOGICAL', label: 'Geological' },
    { value: 'PAVEMENT_MATERIAL', label: 'Pavement/Material' },
    { value: 'SURVEY', label: 'Survey' },
    { value: 'ARCHITECTURE', label: 'Architecture' },
    { value: 'INTERIOR_DESIGN', label: 'Interior Design' },
    { value: 'LANDSCAPE_DESIGN', label: 'Landscape Design' },
    { value: 'STRUCTURE_BUILDING', label: 'Structure(Building)' },
    { value: 'SANITARY', label: 'Sanitary' },
    { value: 'ELECTRICAL_ICT', label: 'Electrical&ICT' },
    { value: 'MECHANICAL', label: 'Mechanical' },
  ] as const;

const USER_DISCIPLINE_LABELS: Record<UserDiscipline, string> =
  USER_DISCIPLINE_DEFINITIONS.reduce(
    (accumulator, definition) => {
      accumulator[definition.value] = definition.label;
      return accumulator;
    },
    {} as Record<UserDiscipline, string>,
  );

const USER_DISCIPLINE_LOOKUP = new Map<string, UserDiscipline>(
  USER_DISCIPLINE_DEFINITIONS.flatMap((definition) => [
    [definition.value, definition.value],
    [definition.label.toLowerCase(), definition.value],
    [
      definition.label.toLowerCase().replace(/[^a-z0-9]+/g, ''),
      definition.value,
    ],
  ]),
);

/** Human-readable label for a user discipline key. */
export function formatUserDisciplineLabel(
  value: UserDiscipline | string,
): string {
  return USER_DISCIPLINE_LABELS[value as UserDiscipline] ?? value;
}

export const USER_DISCIPLINE_OPTIONS = USER_DISCIPLINE_DEFINITIONS.map(
  (definition) => ({
    value: definition.value,
    label: definition.label,
  }),
);

/**
 * Parses import/form input into a discipline enum key, or null when blank.
 * Returns undefined when input is undefined (field omitted).
 */
export function parseUserDisciplineInput(
  value: string | null | undefined,
): UserDiscipline | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value?.trim() ?? '';
  if (trimmed === '') {
    return null;
  }

  const upperKey = trimmed.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (USER_DISCIPLINE_LABELS[upperKey as UserDiscipline]) {
    return upperKey as UserDiscipline;
  }

  const fromLabel = USER_DISCIPLINE_LOOKUP.get(trimmed.toLowerCase());
  if (fromLabel) {
    return fromLabel;
  }

  const compact = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const fromCompact = USER_DISCIPLINE_LOOKUP.get(compact);
  if (fromCompact) {
    return fromCompact;
  }

  return undefined;
}
