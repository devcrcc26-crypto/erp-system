import type { PerDiemDestinationCategory } from './per-diem-destination-categories';

/**
 * Country → per diem category mapping for destination pickers.
 * Ethiopia is Domestic; neighboring countries are Regional; all others International.
 */
export const COUNTRY_CATEGORY_MAP: Record<string, PerDiemDestinationCategory> =
  {
    Ethiopia: 'Domestic',

    Uganda: 'Regional',
    Kenya: 'Regional',
    Tanzania: 'Regional',
    Rwanda: 'Regional',
    Burundi: 'Regional',
    'South Sudan': 'Regional',
    Djibouti: 'Regional',
    Eritrea: 'Regional',
    Somalia: 'Regional',
    Sudan: 'Regional',

    'South Africa': 'International',
    Nigeria: 'International',
    Ghana: 'International',
    Egypt: 'International',
    Morocco: 'International',
    China: 'International',
    Japan: 'International',
    'South Korea': 'International',
    India: 'International',
    Singapore: 'International',
    UAE: 'International',
    'Saudi Arabia': 'International',
    Qatar: 'International',
    Kuwait: 'International',
    Turkey: 'International',
    Germany: 'International',
    France: 'International',
    'United Kingdom': 'International',
    Italy: 'International',
    Spain: 'International',
    Netherlands: 'International',
    'United States': 'International',
    Canada: 'International',
    Brazil: 'International',
  };

export const WORLD_COUNTRIES = Object.keys(COUNTRY_CATEGORY_MAP).sort();

/**
 * Returns the per diem category for a known country, or null if unmapped.
 */
export function getPerDiemCategoryForCountry(
  country: string,
): PerDiemDestinationCategory | null {
  return COUNTRY_CATEGORY_MAP[country] ?? null;
}
