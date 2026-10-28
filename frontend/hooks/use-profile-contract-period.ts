'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  useEmployeeContractsAll,
  useMyEmployeeContractsAll,
} from '@/lib/query/employee-contract';
import {
  contractsForPeriodFilter,
  pickDefaultContractPeriod,
  type ProfileContractPeriod,
} from '@/lib/utils/contract-period';

/**
 * Loads employee contracts and keeps a selected contract period for profile
 * tab filtering. Defaults to the ACTIVE contract (else newest by start).
 */
export function useProfileContractPeriod(options: {
  mode: 'self' | 'employee';
  employeeId?: string;
  enabled?: boolean;
}): {
  periods: ProfileContractPeriod[];
  selected: ProfileContractPeriod | null;
  selectedId: string | null;
  setSelectedId: (id: string) => void;
  isLoading: boolean;
  isError: boolean;
} {
  const enabled = options.enabled !== false;
  const employeeEnabled =
    enabled && options.mode === 'employee' && Boolean(options.employeeId);

  const myQuery = useMyEmployeeContractsAll({}, enabled && options.mode === 'self');
  const employeeQuery = useEmployeeContractsAll(
    { employeeId: options.employeeId },
    employeeEnabled,
  );

  const query = options.mode === 'self' ? myQuery : employeeQuery;
  const periods = useMemo(
    () => contractsForPeriodFilter(query.data ?? []),
    [query.data],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedId(null);
  }, [options.mode, options.employeeId]);

  useEffect(() => {
    if (selectedId && periods.some((row) => row.id === selectedId)) {
      return;
    }
    const fallback = pickDefaultContractPeriod(periods);
    setSelectedId(fallback?.id ?? null);
  }, [periods, selectedId]);

  const selected =
    periods.find((row) => row.id === selectedId) ??
    pickDefaultContractPeriod(periods);

  return {
    periods,
    selected,
    selectedId: selected?.id ?? null,
    setSelectedId,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
