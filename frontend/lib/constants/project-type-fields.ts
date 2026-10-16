export interface ProjectTypeFieldConfig {
  key:
    | 'railwayLengthKm'
    | 'urbanRailLengthKm'
    | 'roadLengthKm'
    | 'grossFloorAreaM2';
  label: string;
  unit: string;
}

export const PROJECT_TYPE_FIELDS: Record<string, ProjectTypeFieldConfig[]> = {
  RAILWAY: [
    { key: 'railwayLengthKm', label: 'Length of Railway', unit: 'km' },
  ],
  URBAN_RAIL_TRANSIT: [
    {
      key: 'urbanRailLengthKm',
      label: 'Length of Urban Rail Transit',
      unit: 'km',
    },
  ],
  ROAD: [{ key: 'roadLengthKm', label: 'Length of Road', unit: 'km' }],
  BUILDING: [
    { key: 'grossFloorAreaM2', label: 'Gross Floor Area', unit: 'm²' },
  ],
  RESIDENTIAL: [
    { key: 'grossFloorAreaM2', label: 'Gross Floor Area', unit: 'm²' },
  ],
  COMMERCIAL: [
    { key: 'grossFloorAreaM2', label: 'Gross Floor Area', unit: 'm²' },
  ],
  MIXED_USE: [
    { key: 'grossFloorAreaM2', label: 'Gross Floor Area', unit: 'm²' },
  ],
  // BRIDGE, TUNNEL, WATER_SUPPLY_DRAINAGE, PORT_HARBOR, AIRPORT,
  // POWER_ENERGY, INDUSTRIAL, INFRASTRUCTURE, OTHER intentionally have no entry -
  // no type-specific fields shown for these until confirmed.
};

export function getFieldsForProjectType(
  type: string | undefined | null,
): ProjectTypeFieldConfig[] {
  if (!type) {
    return [];
  }
  return PROJECT_TYPE_FIELDS[type] ?? [];
}
