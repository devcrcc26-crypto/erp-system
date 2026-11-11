import type { EmployeePerDiemRate, SupportedCurrency } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

/** Canonical per diem destination category labels stored on requests. */
export const PER_DIEM_DESTINATION_CATEGORIES = [
  'Domestic',
  'Regional',
  'International',
] as const;

export type PerDiemDestinationCategory =
  (typeof PER_DIEM_DESTINATION_CATEGORIES)[number];

type RateField = 'domesticRate' | 'regionalRate' | 'internationalRate';

type ActiveField =
  | 'domesticActive'
  | 'regionalActive'
  | 'internationalActive';

const CATEGORY_FIELD_MAP: Record<
  PerDiemDestinationCategory,
  { rate: RateField; active: ActiveField }
> = {
  Domestic: { rate: 'domesticRate', active: 'domesticActive' },
  Regional: { rate: 'regionalRate', active: 'regionalActive' },
  International: {
    rate: 'internationalRate',
    active: 'internationalActive',
  },
};

export interface ResolvedEmployeePerDiemCategoryRate {
  destinationCategory: PerDiemDestinationCategory;
  dailyRate: number;
  currency: SupportedCurrency;
  isActive: boolean;
}

/**
 * Returns true when the value is one of the supported destination categories.
 */
export function isPerDiemDestinationCategory(
  value: string,
): value is PerDiemDestinationCategory {
  return (PER_DIEM_DESTINATION_CATEGORIES as readonly string[]).includes(value);
}

function decimalToNumber(value: Decimal | null | undefined): number | null {
  if (value == null) {
    return null;
  }
  return Number(value);
}

/**
 * Resolves the daily rate and active flag for a destination category on an employee row.
 */
export function resolveEmployeePerDiemCategoryRate(
  row: EmployeePerDiemRate,
  destinationCategory: string,
): ResolvedEmployeePerDiemCategoryRate | null {
  if (!isPerDiemDestinationCategory(destinationCategory)) {
    return null;
  }

  const fields = CATEGORY_FIELD_MAP[destinationCategory];
  const dailyRate = decimalToNumber(row[fields.rate]);
  if (dailyRate == null) {
    return null;
  }

  return {
    destinationCategory,
    dailyRate,
    currency: row.currency,
    isActive: row[fields.active],
  };
}

/**
 * Lists active categories with configured rates for submission dropdowns.
 */
export function listActiveEmployeePerDiemCategories(
  row: EmployeePerDiemRate,
): ResolvedEmployeePerDiemCategoryRate[] {
  return PER_DIEM_DESTINATION_CATEGORIES.map((category) =>
    resolveEmployeePerDiemCategoryRate(row, category),
  ).filter(
    (entry): entry is ResolvedEmployeePerDiemCategoryRate =>
      entry != null && entry.isActive,
  );
}
