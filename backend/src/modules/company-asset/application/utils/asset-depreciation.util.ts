import { Prisma } from '@prisma/client';

export interface AssetDepreciationFields {
  monthsDepreciated: number;
  monthlyDepreciation: number | null;
  accumulatedDepreciation: number | null;
  netValue: number | null;
  depreciationPercent: number | null;
}

export interface AssetDepreciationInput {
  startUseDate?: Date | null;
  usefulLifeMonths?: number | null;
  originalValue?: Prisma.Decimal | null;
}

/** Computes straight-line depreciation metrics for a company asset. */
export function computeAssetDepreciation(
  asset: AssetDepreciationInput,
  asOf: Date = new Date(),
): AssetDepreciationFields {
  const monthsDepreciated = asset.startUseDate
    ? differenceInMonths(asOf, asset.startUseDate)
    : 0;

  const originalValue =
    asset.originalValue !== null ? Number(asset.originalValue) : null;

  const monthlyDepreciation =
    originalValue !== null && asset.usefulLifeMonths
      ? originalValue / asset.usefulLifeMonths
      : null;

  const accumulatedDepreciation =
    monthlyDepreciation !== null && originalValue !== null
      ? Math.min(monthlyDepreciation * monthsDepreciated, originalValue)
      : null;

  const netValue =
    originalValue !== null && accumulatedDepreciation !== null
      ? originalValue - accumulatedDepreciation
      : null;

  const depreciationPercent = asset.usefulLifeMonths
    ? Math.min((monthsDepreciated / asset.usefulLifeMonths) * 100, 100)
    : null;

  return {
    monthsDepreciated,
    monthlyDepreciation,
    accumulatedDepreciation,
    netValue,
    depreciationPercent,
  };
}

function differenceInMonths(later: Date, earlier: Date): number {
  const yearDiff = later.getFullYear() - earlier.getFullYear();
  const monthDiff = later.getMonth() - earlier.getMonth();
  const raw = yearDiff * 12 + monthDiff;
  if (later.getDate() < earlier.getDate()) {
    return Math.max(0, raw - 1);
  }
  return Math.max(0, raw);
}
