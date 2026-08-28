import type { CompanyAssetDetail, CompanyAssetListItem } from '@/lib/api/company-asset.types';

export interface AssetDepreciationSummary {
  monthsDepreciated: number;
  monthlyDepreciation: number | null;
  accumulatedDepreciation: number | null;
  netValue: number | null;
  depreciationPercent: number | null;
}

/** Computes straight-line depreciation metrics for a company asset. */
export function computeAssetDepreciation(
  asset: Pick<
    CompanyAssetListItem,
    'startUseDate' | 'usefulLifeMonths' | 'originalValue'
  >,
  asOf: Date = new Date(),
): AssetDepreciationSummary {
  const monthsDepreciated = asset.startUseDate
    ? differenceInMonths(asOf, new Date(asset.startUseDate))
    : 0;

  const originalValue = toNumber(asset.originalValue);

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

export function getDepreciationProgressColor(
  depreciationPercent: number | null | undefined,
): string {
  if (depreciationPercent == null) {
    return '#52c41a';
  }
  if (depreciationPercent >= 100) {
    return '#8c8c8c';
  }
  if (depreciationPercent >= 80) {
    return '#ff4d4f';
  }
  if (depreciationPercent >= 50) {
    return '#faad14';
  }
  return '#52c41a';
}

export function getNetValueColor(
  netValue: number | string | null | undefined,
  originalValue: number | string | null | undefined,
): string {
  const net = toNumber(netValue);
  const original = toNumber(originalValue);
  if (net == null || original == null || original <= 0) {
    return 'inherit';
  }
  const remainingPercent = (net / original) * 100;
  if (remainingPercent > 50) {
    return '#52c41a';
  }
  if (remainingPercent >= 20) {
    return '#faad14';
  }
  return '#ff4d4f';
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

export function resolveAssetDepreciation(
  asset: CompanyAssetDetail | CompanyAssetListItem,
): AssetDepreciationSummary {
  if (
    asset.monthsDepreciated != null &&
    asset.depreciationPercent != null
  ) {
    return {
      monthsDepreciated: asset.monthsDepreciated,
      monthlyDepreciation: toNumber(asset.monthlyDepreciation),
      accumulatedDepreciation: toNumber(asset.accumulatedDepreciation),
      netValue: toNumber(asset.netValue),
      depreciationPercent: toNumber(asset.depreciationPercent),
    };
  }
  return computeAssetDepreciation(asset);
}
