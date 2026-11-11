import type { CSSProperties } from 'react';
import type { PayrollEntryFlag, PayrollRunStatus } from '@/lib/api/payroll.types';
import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';

export function parsePayrollMoney(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  const n = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/** ETB amounts: thousand separators, 2 decimals; zero → em dash for table cells. */
export function formatPayrollMoney(
  value: number | string | null | undefined,
  options?: { emptyZero?: boolean },
): string {
  const amount = parsePayrollMoney(value);
  if (options?.emptyZero !== false && amount === 0) {
    return '-';
  }
  return new Intl.NumberFormat('en-ET', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export const PAYROLL_MONEY_CELL_STYLE: CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  textAlign: 'right',
  whiteSpace: 'nowrap',
};

export function formatPayrollPeriod(month: number, year: number): string {
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export function payrollStatusLabelKey(status: PayrollRunStatus): string {
  return `hr.payroll.status.${status}`;
}

export function payrollStatusVariant(status: PayrollRunStatus): StatusBadgeVariant {
  switch (status) {
    case 'DRAFT':
      return 'default';
    case 'REVIEWED':
      return 'info';
    case 'SUBMITTED':
      return 'orange';
    case 'APPROVED':
      return 'cyan';
    case 'GM_APPROVED':
      return 'success';
    case 'PAID':
      return 'success';
    case 'CANCELLED':
      return 'error';
    case 'SUPERSEDED':
      return 'default';
    default:
      return 'default';
  }
}

/** Custom tag colors per spec (GM_APPROVED green, PAID dark green). */
export function payrollStatusTagStyle(status: PayrollRunStatus): CSSProperties {
  switch (status) {
    case 'DRAFT':
      return { color: '#6B7280', background: '#F3F4F6' };
    case 'REVIEWED':
      return { color: '#2563EB', background: '#EFF6FF' };
    case 'SUBMITTED':
      return { color: '#EA580C', background: '#FFF7ED' };
    case 'APPROVED':
      return { color: '#0891B2', background: '#ECFEFF' };
    case 'GM_APPROVED':
      return { color: '#639922', background: '#EAF3DE' };
    case 'PAID':
      return { color: '#14532D', background: '#DCFCE7' };
    case 'CANCELLED':
      return { color: '#DC2626', background: '#FEE2E2' };
    case 'SUPERSEDED':
      return { color: '#6B7280', background: '#F3F4F6' };
    default:
      return { color: '#6B7280', background: '#F3F4F6' };
  }
}

export function payrollFlagLabelKey(flag: PayrollEntryFlag): string {
  return `hr.payroll.flags.${flag}`;
}

export function computeLeaveCoveredDays(entry: {
  employedDays: number | string;
  absentDays: number | string;
  payrollDays: number | string;
}): number {
  const employed = parsePayrollMoney(entry.employedDays);
  const absent = parsePayrollMoney(entry.absentDays);
  const paid = parsePayrollMoney(entry.payrollDays);
  const raw = employed - absent - paid;
  return raw > 0 ? Math.round(raw * 100) / 100 : 0;
}

export function countEntryFlags(
  entries: readonly { flag: PayrollEntryFlag }[],
): Record<PayrollEntryFlag, number> {
  const counts: Record<PayrollEntryFlag, number> = {
    NONE: 0,
    MISSING_ATTENDANCE: 0,
    MISSING_CONTRACT: 0,
    MISSING_OVERTIME_APPROVAL: 0,
    ZERO_SALARY: 0,
    MANUAL_OVERRIDE: 0,
    LEAVER_FINAL_MONTH: 0,
    LOGIN_DISABLED_STILL_EMPLOYED: 0,
    INACTIVE_IN_MONTH: 0,
    CONTRACT_ENDED_NOT_RENEWED: 0,
  };
  for (const entry of entries) {
    if (entry.flag !== 'NONE') {
      counts[entry.flag] += 1;
    }
  }
  return counts;
}
