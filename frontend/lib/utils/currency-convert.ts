import type { SupportedCurrency } from '@/lib/api/per-diem.types';

/**
 * Rates map from `/currency/rates`: units of ETB per 1 unit of currency
 * (ETB = 1, USD/CNY = daily cached rates).
 */
export function etbPerUnit(
  currency: SupportedCurrency,
  rates: Record<string, number> | undefined,
): number | null {
  if (currency === 'ETB') {
    return 1;
  }
  const rate = rates?.[currency];
  if (rate == null || !Number.isFinite(rate) || rate <= 0) {
    return null;
  }
  return rate;
}

/**
 * Convert an amount between supported currencies via ETB.
 */
export function convertCurrencyAmount(
  amount: number,
  from: SupportedCurrency,
  to: SupportedCurrency,
  rates: Record<string, number> | undefined,
): number | null {
  if (!Number.isFinite(amount)) {
    return null;
  }
  if (from === to) {
    return amount;
  }
  const fromRate = etbPerUnit(from, rates);
  const toRate = etbPerUnit(to, rates);
  if (fromRate == null || toRate == null) {
    return null;
  }
  return (amount * fromRate) / toRate;
}

/**
 * Round to 2 decimal places for daily rate inputs.
 */
export function roundCurrencyAmount(amount: number): number {
  return Math.round(amount * 100) / 100;
}
