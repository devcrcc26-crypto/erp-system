/**
 * Statutory remittance for a payroll run: the run's own income tax and pension
 * plus the tax / pension differences of corrections it carries. A correction's
 * differences are carried once, in full, by the first run that settles its
 * reconciliation item (never pro rata over instalments).
 */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const round2 = (value: number): number => Math.round(value * 100) / 100;

export interface StatutoryDifferences {
  incomeTax: number;
  pensionEmployee: number;
  pensionEmployer: number;
}

export interface ReconciliationForCarry {
  id: string;
  /** Run that already carried this item's differences, if any. */
  statutoryRunId: string | null;
  incomeTaxDifference: number;
  employeePensionDifference: number;
  employerPensionDifference: number;
}

export function hasStatutoryDifference(item: ReconciliationForCarry): boolean {
  return (
    Math.abs(item.incomeTaxDifference) >= 0.005 ||
    Math.abs(item.employeePensionDifference) >= 0.005 ||
    Math.abs(item.employerPensionDifference) >= 0.005
  );
}

/**
 * Items a run settling them should carry: differences not carried yet (by this
 * or any other run). A later instalment of the same item carries nothing.
 */
export function itemsToCarry<T extends ReconciliationForCarry>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return item.statutoryRunId == null && hasStatutoryDifference(item);
  });
}

export function correctionPeriodLabel(forMonth: number, forYear: number): string {
  return `${MONTHS[forMonth - 1] ?? forMonth} ${forYear} correction`;
}

export interface StatutoryCarryLine extends StatutoryDifferences {
  reconciliationId: string;
  employeeId: string;
  employeeName: string;
  /** Employee number, so the declaration row can be matched to the employee. */
  employeeCode?: string | null;
  forMonth: number;
  forYear: number;
  /** Instalments planned for the item when it is settled over several runs. */
  instalmentCount: number | null;
  /** True until the run is approved (preview of what approval will carry). */
  pending: boolean;
}

export interface RemittanceLine {
  label: string;
  amount: number;
  /** e.g. employee name, and the "carried in full with instalment 1 of 3" note. */
  detail: string | null;
  /** Employee number of the carried item (null for the run's own figure). */
  employeeCode?: string | null;
  reconciliationId: string | null;
  pending: boolean;
}

export interface RemittanceSection {
  /** The run's own figure (sum of its entries). */
  runAmount: number;
  adjustments: RemittanceLine[];
  /** runAmount + adjustments: what is declared / remitted for this run. */
  total: number;
}

export interface PayrollRunRemittance {
  incomeTax: RemittanceSection;
  pensionEmployee: RemittanceSection;
  pensionEmployer: RemittanceSection;
}

/** One labelled line per carried correction and statutory item. */
export function buildRemittance(
  base: StatutoryDifferences,
  carries: readonly StatutoryCarryLine[],
): PayrollRunRemittance {
  const section = (
    runAmount: number,
    pick: (carry: StatutoryCarryLine) => number,
    kind: 'Tax' | 'Pension (employee)' | 'Pension (employer)',
  ): RemittanceSection => {
    const adjustments: RemittanceLine[] = carries
      .filter((carry) => Math.abs(pick(carry)) >= 0.005)
      .map((carry) => {
        const instalmentNote =
          carry.instalmentCount != null && carry.instalmentCount > 1
            ? `carried in full with instalment 1 of ${carry.instalmentCount}`
            : null;
        return {
          label: `${kind} adjustment – ${correctionPeriodLabel(carry.forMonth, carry.forYear)}`,
          amount: round2(pick(carry)),
          detail:
            [
              carry.employeeCode
                ? `${carry.employeeName} (${carry.employeeCode})`
                : carry.employeeName,
              instalmentNote,
            ]
              .filter(Boolean)
              .join(' · ') || null,
          employeeCode: carry.employeeCode ?? null,
          reconciliationId: carry.reconciliationId,
          pending: carry.pending,
        };
      });
    return {
      runAmount: round2(runAmount),
      adjustments,
      total: round2(runAmount + adjustments.reduce((sum, line) => sum + line.amount, 0)),
    };
  };
  return {
    incomeTax: section(base.incomeTax, (carry) => carry.incomeTax, 'Tax'),
    pensionEmployee: section(
      base.pensionEmployee,
      (carry) => carry.pensionEmployee,
      'Pension (employee)',
    ),
    pensionEmployer: section(
      base.pensionEmployer,
      (carry) => carry.pensionEmployer,
      'Pension (employer)',
    ),
  };
}
