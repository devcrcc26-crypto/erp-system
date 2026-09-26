import type { PerDiemDestinationCategory } from './per-diem-destination-categories';

/**
 * Country → per diem category mapping for destination pickers.
 * Neighboring countries are Regional; all other listed countries are International.
 * Ethiopia is Domestic when selected (e.g. flight origin defaults).
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
    Tunisia: 'International',
    Cameroon: 'International',
    Senegal: 'International',
    Zimbabwe: 'International',
    Zambia: 'International',
    Mozambique: 'International',
    China: 'International',
    Japan: 'International',
    'South Korea': 'International',
    India: 'International',
    Singapore: 'International',
    Malaysia: 'International',
    Thailand: 'International',
    Vietnam: 'International',
    Indonesia: 'International',
    Philippines: 'International',
    UAE: 'International',
    'Saudi Arabia': 'International',
    Qatar: 'International',
    Kuwait: 'International',
    Bahrain: 'International',
    Oman: 'International',
    Jordan: 'International',
    Lebanon: 'International',
    Turkey: 'International',
    Germany: 'International',
    France: 'International',
    'United Kingdom': 'International',
    Italy: 'International',
    Spain: 'International',
    Netherlands: 'International',
    Belgium: 'International',
    Switzerland: 'International',
    Sweden: 'International',
    Norway: 'International',
    Denmark: 'International',
    Austria: 'International',
    Portugal: 'International',
    Poland: 'International',
    'United States': 'International',
    Canada: 'International',
    Brazil: 'International',
    Mexico: 'International',
    Argentina: 'International',
    Colombia: 'International',
    Chile: 'International',
  };

export const WORLD_COUNTRIES = Object.keys(COUNTRY_CATEGORY_MAP)
  .filter((country) => country !== 'Ethiopia')
  .sort();

/**
 * Returns the per diem category for a known country, or null if unmapped.
 */
export function getPerDiemCategoryForCountry(
  country: string,
): PerDiemDestinationCategory | null {
  return COUNTRY_CATEGORY_MAP[country] ?? null;
}
