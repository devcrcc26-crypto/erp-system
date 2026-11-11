'use client';

import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api/client';

export const currencyKeys = {
  rates: ['currency', 'rates'] as const,
};

/** Current USD/CNY exchange rates against ETB, cached daily server-side. */
export function useCurrencyRates(enabled = true) {
  return useQuery({
    queryKey: currencyKeys.rates,
    queryFn: () => apiGet<Record<string, number>>('/currency/rates'),
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
}
