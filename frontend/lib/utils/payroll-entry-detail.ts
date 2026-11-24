import type { MoneyField } from '@/lib/api/payroll.types';
import { parsePayrollMoney } from '@/lib/utils/payroll-display';

/** OT buckets with pay — matches policy defaults (÷192 / ÷196 × multipliers). */
export type OtBreakdownLine = {
  key: 'normal' | 'evening' | 'sunday' | 'holiday';
  hours: number;
  pay: number;
  labelKey:
    | 'hr.payroll.entry.otNormalLine'
    | 'hr.payroll.entry.otEveningLine'
    | 'hr.payroll.entry.otSundayLine'
    | 'hr.payroll.entry.otHolidayLine';
};

type Money = MoneyField | null | undefined;

/** Non-empty OT lines of an entry or salary period. */
export function buildOtBreakdownLines(source: {
  normalOtHours: Money;
  eveningOtHours: Money;
  sundayOtHours: Money;
  holidayOtHours: Money;
  normalOtPay: Money;
  eveningOtPay: Money;
  sundayOtPay: Money;
  holidayOtPay: Money;
}): OtBreakdownLine[] {
  const rows: OtBreakdownLine[] = [
    {
      key: 'normal',
      hours: parsePayrollMoney(source.normalOtHours),
      pay: parsePayrollMoney(source.normalOtPay),
      labelKey: 'hr.payroll.entry.otNormalLine',
    },
    {
      key: 'evening',
      hours: parsePayrollMoney(source.eveningOtHours),
      pay: parsePayrollMoney(source.eveningOtPay),
      labelKey: 'hr.payroll.entry.otEveningLine',
    },
    {
      key: 'sunday',
      hours: parsePayrollMoney(source.sundayOtHours),
      pay: parsePayrollMoney(source.sundayOtPay),
      labelKey: 'hr.payroll.entry.otSundayLine',
    },
    {
      key: 'holiday',
      hours: parsePayrollMoney(source.holidayOtHours),
      pay: parsePayrollMoney(source.holidayOtPay),
      labelKey: 'hr.payroll.entry.otHolidayLine',
    },
  ];
  return rows.filter((row) => row.hours > 0 || row.pay > 0);
}

/** Ethiopian monthly income tax (estimate for previews only). */
export function estimateEthiopianTax(taxableIncome: number): number {
  if (taxableIncome <= 2000) return 0;
  if (taxableIncome <= 4000) return taxableIncome * 0.15 - 300;
  if (taxableIncome <= 7000) return taxableIncome * 0.2 - 500;
  if (taxableIncome <= 10000) return taxableIncome * 0.25 - 850;
  if (taxableIncome <= 14000) return taxableIncome * 0.3 - 1350;
  return taxableIncome * 0.35 - 2050;
}

/**
 * Estimated net-pay change from a top-up: net top-ups add as is; taxable
 * top-ups lose the extra tax they cause. Preview only; the server calculates.
 */
export function estimateNetIncrease(
  treatment: 'taxable' | 'net',
  amount: number | null | undefined,
  taxableIncome: number,
): number {
  const value = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  if (value <= 0) {
    return 0;
  }
  if (treatment === 'net') {
    return Math.round(value * 100) / 100;
  }
  const taxBefore = estimateEthiopianTax(taxableIncome);
  const taxAfter = estimateEthiopianTax(taxableIncome + value);
  return Math.round((value - (taxAfter - taxBefore)) * 100) / 100;
}
