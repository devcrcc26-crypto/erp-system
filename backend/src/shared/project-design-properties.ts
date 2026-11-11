/**
 * Project design properties - backend source of truth; keys must match Prisma enum.
 */
export const PROJECT_DESIGN_PROPERTIES_VALUES = [
  'PRELIMINARY',
  'GEOTECNICAL_INVESTIGATION',
  'SURVEY',
  'IMPLEMENTATION_DB',
  'IMPLEMENTATION_DBB',
] as const;

export type ProjectDesignProperties =
  (typeof PROJECT_DESIGN_PROPERTIES_VALUES)[number];

export interface ProjectDesignPropertiesDefinition {
  value: ProjectDesignProperties;
  label: string;
}

export const PROJECT_DESIGN_PROPERTIES_DEFINITIONS: readonly ProjectDesignPropertiesDefinition[] =
  [
    { value: 'PRELIMINARY', label: 'Preliminary' },
    { value: 'GEOTECNICAL_INVESTIGATION', label: 'Geotecnical Investigation' },
    { value: 'SURVEY', label: 'Survey' },
    { value: 'IMPLEMENTATION_DB', label: 'Implementation（DB）' },
    { value: 'IMPLEMENTATION_DBB', label: 'Implementation（DBB）' },
  ] as const;

export const PROJECT_DESIGN_PROPERTIES_DEFAULT: ProjectDesignProperties =
  'PRELIMINARY';

/** Maps legacy free-text values to the current enum set (migrations/seeds). */
export const LEGACY_PROJECT_DESIGN_PROPERTIES_MAP: Record<
  string,
  ProjectDesignProperties
> = {
  Preliminary: 'PRELIMINARY',
  PRELIMINARY: 'PRELIMINARY',
  prelim: 'PRELIMINARY',
  'Geotecnical Investigation': 'GEOTECNICAL_INVESTIGATION',
  'Geotechnical Investigation': 'GEOTECNICAL_INVESTIGATION',
  GEOTECNICAL_INVESTIGATION: 'GEOTECNICAL_INVESTIGATION',
  Survey: 'SURVEY',
  SURVEY: 'SURVEY',
  'Implementation（DB）': 'IMPLEMENTATION_DB',
  'Implementation (DB)': 'IMPLEMENTATION_DB',
  IMPLEMENTATION_DB: 'IMPLEMENTATION_DB',
  'Design-Build': 'IMPLEMENTATION_DB',
  'Design-build': 'IMPLEMENTATION_DB',
  'Design Build': 'IMPLEMENTATION_DB',
  EPC: 'IMPLEMENTATION_DB',
  'Implementation（DBB）': 'IMPLEMENTATION_DBB',
  'Implementation (DBB)': 'IMPLEMENTATION_DBB',
  IMPLEMENTATION_DBB: 'IMPLEMENTATION_DBB',
  'Design-Bid-Build': 'IMPLEMENTATION_DBB',
  'design-bid-build': 'IMPLEMENTATION_DBB',
  'Design Bid Build': 'IMPLEMENTATION_DBB',
  Consultancy: 'PRELIMINARY',
};

const PROJECT_DESIGN_PROPERTIES_LABELS: Record<
  ProjectDesignProperties,
  string
> = PROJECT_DESIGN_PROPERTIES_DEFINITIONS.reduce(
  (accumulator, definition) => {
    accumulator[definition.value] = definition.label;
    return accumulator;
  },
  {} as Record<ProjectDesignProperties, string>,
);

/** Human-readable label for a project design properties key. */
export function formatProjectDesignPropertiesLabel(
  value: ProjectDesignProperties | string,
): string {
  return (
    PROJECT_DESIGN_PROPERTIES_LABELS[value as ProjectDesignProperties] ??
    value
  );
}

export const PROJECT_DESIGN_PROPERTIES_OPTIONS =
  PROJECT_DESIGN_PROPERTIES_DEFINITIONS.map((definition) => ({
    value: definition.value,
    label: definition.label,
  }));

export type ProjectDesignPropertiesBadgeVariant =
  | 'default'
  | 'info'
  | 'orange'
  | 'success'
  | 'warning';

export function projectDesignPropertiesBadgeVariant(
  value: ProjectDesignProperties,
): ProjectDesignPropertiesBadgeVariant {
  switch (value) {
    case 'PRELIMINARY':
      return 'default';
    case 'GEOTECNICAL_INVESTIGATION':
      return 'warning';
    case 'SURVEY':
      return 'info';
    case 'IMPLEMENTATION_DB':
      return 'orange';
    case 'IMPLEMENTATION_DBB':
      return 'success';
    default:
      return 'default';
  }
}
