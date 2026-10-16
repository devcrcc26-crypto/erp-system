/**
 * User engineering discipline values and labels - must match backend enum keys.
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

export function formatUserDisciplineLabel(
  value: UserDiscipline | string | null | undefined,
): string {
  if (!value) {
    return '-';
  }
  return USER_DISCIPLINE_LABELS[value as UserDiscipline] ?? value;
}

export const USER_DISCIPLINE_OPTIONS = USER_DISCIPLINE_DEFINITIONS.map(
  (definition) => ({
    value: definition.value,
    label: definition.label,
  }),
);
