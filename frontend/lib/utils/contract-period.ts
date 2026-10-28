import type { EmployeeContractListItem } from '@/lib/api/employee-contract.types';
import type { LeavePeriod, LeaveRequestListItem } from '@/lib/api/leave.types';

/** Profile / HR period filter driven by employee contracts. */
export interface ProfileContractPeriod {
  id: string;
  contractNumber: string;
  startDate: string;
  /** Inclusive end; null when the contract is open-ended. */
  endDate: string | null;
  status: EmployeeContractListItem['status'];
}

const OPEN_END = '9999-12-31';

export function toDateKey(value: string | Date | null | undefined): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

/** Effective inclusive end date for filtering (open-ended → far future). */
export function contractPeriodEndKey(period: {
  endDate?: string | null;
  terminatedAt?: string | null;
}): string {
  const terminated = toDateKey(period.terminatedAt ?? null);
  const end = toDateKey(period.endDate ?? null);
  if (terminated && end) {
    return terminated < end ? terminated : end;
  }
  return terminated || end || OPEN_END;
}

export function toProfileContractPeriod(
  row: EmployeeContractListItem,
): ProfileContractPeriod {
  const endKey = contractPeriodEndKey(row);
  return {
    id: row.id,
    contractNumber: row.contractNumber,
    startDate: toDateKey(row.startDate),
    endDate: endKey === OPEN_END ? null : endKey,
    status: row.status,
  };
}

/** Non-draft contracts, newest start first. */
export function contractsForPeriodFilter(
  rows: EmployeeContractListItem[],
): ProfileContractPeriod[] {
  return rows
    .filter((row) => row.status !== 'DRAFT')
    .map(toProfileContractPeriod)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
}

/** Prefer ACTIVE; otherwise the newest by start date. */
export function pickDefaultContractPeriod(
  periods: ProfileContractPeriod[],
): ProfileContractPeriod | null {
  if (periods.length === 0) {
    return null;
  }
  return periods.find((row) => row.status === 'ACTIVE') ?? periods[0] ?? null;
}

export function rangesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  return startA <= endB && endA >= startB;
}

export function periodEndOrOpen(period: ProfileContractPeriod): string {
  return period.endDate ?? OPEN_END;
}

export function requestOverlapsContractPeriod(
  row: Pick<LeaveRequestListItem, 'startDate' | 'endDate' | 'periods'>,
  period: ProfileContractPeriod,
): boolean {
  const periodEnd = periodEndOrOpen(period);
  const segments = leaveSegments(row);
  return segments.some((segment) =>
    rangesOverlap(
      segment.startDate,
      segment.endDate,
      period.startDate,
      periodEnd,
    ),
  );
}

function leaveSegments(
  row: Pick<LeaveRequestListItem, 'startDate' | 'endDate' | 'days' | 'periods'>,
): LeavePeriod[] {
  if (row.periods && row.periods.length > 0) {
    return row.periods.map((period) => ({
      startDate: toDateKey(period.startDate),
      endDate: toDateKey(period.endDate),
      days: Number(period.days),
    }));
  }
  return [
    {
      startDate: toDateKey(row.startDate),
      endDate: toDateKey(row.endDate ?? row.startDate),
      days: Number(row.days ?? 0),
    },
  ];
}

/**
 * Days charged inside the selected contract window (uses stored period
 * segments so anniversary-split requests match the leave-year ledger).
 */
export function leaveDaysInContractPeriod(
  row: Pick<LeaveRequestListItem, 'startDate' | 'endDate' | 'days' | 'periods'>,
  period: ProfileContractPeriod,
): number {
  const periodEnd = periodEndOrOpen(period);
  let total = 0;
  for (const segment of leaveSegments(row)) {
    if (
      rangesOverlap(
        segment.startDate,
        segment.endDate,
        period.startDate,
        periodEnd,
      )
    ) {
      total += Number(segment.days);
    }
  }
  return Math.round(total * 10) / 10;
}

/** Calendar years that overlap a contract period (inclusive). */
export function calendarYearsInContractPeriod(
  period: ProfileContractPeriod,
): number[] {
  const startYear = Number(period.startDate.slice(0, 4));
  const endKey = periodEndOrOpen(period);
  const endYear = Math.min(Number(endKey.slice(0, 4)), 2100);
  if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) {
    return [];
  }
  const years: number[] = [];
  for (let year = startYear; year <= endYear; year += 1) {
    years.push(year);
  }
  return years;
}

/** True when a calendar month overlaps the contract window. */
export function monthOverlapsContractPeriod(
  year: number,
  month: number,
  period: ProfileContractPeriod,
): boolean {
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return rangesOverlap(
    monthStart,
    monthEnd,
    period.startDate,
    periodEndOrOpen(period),
  );
}
