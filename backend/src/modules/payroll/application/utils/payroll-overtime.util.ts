/**
 * Assign dated overtime entries to salary periods and price them from each
 * period's contractual basic (÷192, holiday ÷196).
 *
 * Overnight: OvertimeEntry stores one row with `date` = start day and combined
 * hour buckets (classification already spans midnight). Hours are not split
 * into separate calendar-day entries, so payroll assigns overnight OT by the
 * entry's start date ({@link OVERNIGHT_OT_DATE_ASSIGNMENT}).
 */

export const OVERNIGHT_OT_DATE_ASSIGNMENT = 'START_DATE' as const;

export const OT_FALLBACK_MONTH_END_NOTE =
  'Overtime rate from month-end contract (no dated entries)';

export interface OvertimeHoursBuckets {
  normalHours: number;
  eveningHours: number;
  sundayHours: number;
  holidayHours: number;
}

export interface OvertimePayAmounts {
  normalOtPay: number;
  eveningOtPay: number;
  sundayOtPay: number;
  holidayOtPay: number;
  totalOtPay: number;
}

export interface DatedOvertimeEntry {
  date: Date;
  isOvernight: boolean;
  normalHours: number;
  eveningHours: number;
  sundayHours: number;
  holidayHours: number;
}

export interface SalaryPeriodWindow {
  contractId: string;
  periodStart: Date;
  periodEnd: Date;
  basicSalary: number;
}

export interface PeriodOvertimeResult extends OvertimeHoursBuckets, OvertimePayAmounts {
  contractId: string;
  periodStart: Date;
  periodEnd: Date;
  basicSalary: number;
}

export interface AssignedOvertimeResult {
  periods: PeriodOvertimeResult[];
  totals: OvertimeHoursBuckets & OvertimePayAmounts;
  /** True when sheet totals were used with month-end basic (no dated entries). */
  usedMonthEndFallback: boolean;
}

const ZERO_HOURS: OvertimeHoursBuckets = {
  normalHours: 0,
  eveningHours: 0,
  sundayHours: 0,
  holidayHours: 0,
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toDateOnlyUtc(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function dateInInclusiveRange(date: Date, start: Date, end: Date): boolean {
  const d = toDateOnlyUtc(date).getTime();
  return d >= toDateOnlyUtc(start).getTime() && d <= toDateOnlyUtc(end).getTime();
}

function addHours(
  a: OvertimeHoursBuckets,
  b: OvertimeHoursBuckets,
): OvertimeHoursBuckets {
  return {
    normalHours: round2(a.normalHours + b.normalHours),
    eveningHours: round2(a.eveningHours + b.eveningHours),
    sundayHours: round2(a.sundayHours + b.sundayHours),
    holidayHours: round2(a.holidayHours + b.holidayHours),
  };
}

function hasHours(h: OvertimeHoursBuckets): boolean {
  return (
    h.normalHours > 0 ||
    h.eveningHours > 0 ||
    h.sundayHours > 0 ||
    h.holidayHours > 0
  );
}

/**
 * OT pay from contractual basic ÷ 192 (holiday ÷ 196) × hours × rate.
 */
export function calculateOvertimePay(
  basicSalary: number,
  hours: OvertimeHoursBuckets,
): OvertimePayAmounts {
  const hourlyBase = basicSalary / 192;
  const holidayHourlyBase = basicSalary / 196;
  const normalOtPay = round2(hourlyBase * hours.normalHours * 1.5);
  const eveningOtPay = round2(hourlyBase * hours.eveningHours * 1.75);
  const sundayOtPay = round2(hourlyBase * hours.sundayHours * 2.0);
  const holidayOtPay = round2(holidayHourlyBase * hours.holidayHours * 2.5);
  return {
    normalOtPay,
    eveningOtPay,
    sundayOtPay,
    holidayOtPay,
    totalOtPay: round2(
      normalOtPay + eveningOtPay + sundayOtPay + holidayOtPay,
    ),
  };
}

function emptyPeriodResult(period: SalaryPeriodWindow): PeriodOvertimeResult {
  const pay = calculateOvertimePay(period.basicSalary, ZERO_HOURS);
  return {
    contractId: period.contractId,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    basicSalary: period.basicSalary,
    ...ZERO_HOURS,
    ...pay,
  };
}

/**
 * Assign each dated OT entry to the salary period covering its date, price with
 * that period's basic, and sum hours/pay for the payroll entry.
 *
 * When `entries` is empty but `sheetTotals` has hours, falls back to month-end
 * basic (last period) for all hours.
 */
export function assignOvertimeToSalaryPeriods(input: {
  entries: DatedOvertimeEntry[];
  periods: SalaryPeriodWindow[];
  sheetTotals?: OvertimeHoursBuckets | null;
  /** Basic used when there is a single period or for fallback. */
  monthEndBasic: number;
}): AssignedOvertimeResult {
  const { entries, periods, sheetTotals, monthEndBasic } = input;

  if (periods.length === 0) {
    const hours = sheetTotals ?? ZERO_HOURS;
    const pay = calculateOvertimePay(monthEndBasic, hours);
    return {
      periods: [],
      totals: { ...hours, ...pay },
      usedMonthEndFallback: hasHours(hours),
    };
  }

  const datedWithHours = entries.filter((e) =>
    hasHours({
      normalHours: e.normalHours,
      eveningHours: e.eveningHours,
      sundayHours: e.sundayHours,
      holidayHours: e.holidayHours,
    }),
  );

  if (datedWithHours.length === 0) {
    const hours = sheetTotals ?? ZERO_HOURS;
    if (!hasHours(hours)) {
      return {
        periods: periods.map(emptyPeriodResult),
        totals: { ...ZERO_HOURS, ...calculateOvertimePay(monthEndBasic, ZERO_HOURS) },
        usedMonthEndFallback: false,
      };
    }
    // Fallback: all sheet totals priced on month-end contract.
    const pay = calculateOvertimePay(monthEndBasic, hours);
    const last = periods[periods.length - 1]!;
    const periodResults = periods.map((p, index) => {
      if (index === periods.length - 1) {
        return {
          contractId: p.contractId,
          periodStart: p.periodStart,
          periodEnd: p.periodEnd,
          basicSalary: p.basicSalary,
          ...hours,
          ...pay,
        };
      }
      return emptyPeriodResult(p);
    });
    void last;
    return {
      periods: periodResults,
      totals: { ...hours, ...pay },
      usedMonthEndFallback: true,
    };
  }

  const periodHours = periods.map(() => ({ ...ZERO_HOURS }));

  for (const entry of datedWithHours) {
    // Overnight: use start date (hours not stored per calendar day).
    const assignDate = toDateOnlyUtc(entry.date);
    let periodIndex = periods.findIndex((p) =>
      dateInInclusiveRange(assignDate, p.periodStart, p.periodEnd),
    );
    if (periodIndex < 0) {
      // Outside all windows — attach to nearest period by start date.
      periodIndex = 0;
      for (let i = 0; i < periods.length; i += 1) {
        if (assignDate.getTime() >= toDateOnlyUtc(periods[i]!.periodStart).getTime()) {
          periodIndex = i;
        }
      }
    }
    periodHours[periodIndex] = addHours(periodHours[periodIndex]!, {
      normalHours: entry.normalHours,
      eveningHours: entry.eveningHours,
      sundayHours: entry.sundayHours,
      holidayHours: entry.holidayHours,
    });
  }

  const periodResults: PeriodOvertimeResult[] = periods.map((p, i) => {
    const hours = periodHours[i]!;
    const pay = calculateOvertimePay(p.basicSalary, hours);
    return {
      contractId: p.contractId,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      basicSalary: p.basicSalary,
      ...hours,
      ...pay,
    };
  });

  const totalsHours = periodResults.reduce(
    (acc, p) =>
      addHours(acc, {
        normalHours: p.normalHours,
        eveningHours: p.eveningHours,
        sundayHours: p.sundayHours,
        holidayHours: p.holidayHours,
      }),
    { ...ZERO_HOURS },
  );
  const totalsPay: OvertimePayAmounts = {
    normalOtPay: round2(
      periodResults.reduce((s, p) => s + p.normalOtPay, 0),
    ),
    eveningOtPay: round2(
      periodResults.reduce((s, p) => s + p.eveningOtPay, 0),
    ),
    sundayOtPay: round2(
      periodResults.reduce((s, p) => s + p.sundayOtPay, 0),
    ),
    holidayOtPay: round2(
      periodResults.reduce((s, p) => s + p.holidayOtPay, 0),
    ),
    totalOtPay: 0,
  };
  totalsPay.totalOtPay = round2(
    totalsPay.normalOtPay +
      totalsPay.eveningOtPay +
      totalsPay.sundayOtPay +
      totalsPay.holidayOtPay,
  );

  return {
    periods: periodResults,
    totals: { ...totalsHours, ...totalsPay },
    usedMonthEndFallback: false,
  };
}
