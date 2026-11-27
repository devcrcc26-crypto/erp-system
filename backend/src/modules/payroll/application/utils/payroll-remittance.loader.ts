import type { PayrollRun, PrismaClient } from '@prisma/client';
import {
  buildRemittance,
  itemsToCarry,
  type PayrollRunRemittance,
  type StatutoryCarryLine,
} from './payroll-remittance.util';

type Db = Pick<
  PrismaClient,
  'payrollAdjustmentLine' | 'payrollReconciliation' | 'payrollStatutoryAdjustment'
>;

/** Runs not yet approved: the carried lines are a preview of what approval carries. */
const PREVIEW_STATUSES = new Set(['DRAFT', 'REVIEWED', 'SUBMITTED']);

const num = (value: unknown): number => (value == null ? 0 : Number(value));

/**
 * Income tax and pension to declare / remit for a regular run: its own totals
 * plus the correction differences it carries (persisted at approval; a
 * preview before). Used by the run API and the Excel export.
 */
export async function loadRunRemittance(
  db: Db,
  run: Pick<
    PayrollRun,
    'id' | 'companyId' | 'type' | 'status' | 'totalTax' | 'totalPensionEmp' | 'totalPensionEmr'
  >,
): Promise<PayrollRunRemittance> {
  const base = {
    incomeTax: num(run.totalTax),
    pensionEmployee: num(run.totalPensionEmp),
    pensionEmployer: num(run.totalPensionEmr),
  };
  const employeeName = (employee: { firstName: string; lastName: string }): string =>
    `${employee.firstName} ${employee.lastName}`.trim();
  const employeeSelect = { select: { firstName: true, lastName: true, employeeId: true } } as const;

  // Instalments planned for each item settled here (from its first line in this run).
  const instalments = new Map<string, number | null>();
  const settlementLines = await db.payrollAdjustmentLine.findMany({
    where: { payrollRunId: run.id, reconciliationId: { not: null } },
    select: { reconciliationId: true, instalmentCount: true },
    orderBy: { createdAt: 'asc' },
  });
  for (const line of settlementLines) {
    const id = line.reconciliationId as string;
    if (!instalments.has(id)) {
      instalments.set(id, line.instalmentCount);
    }
  }

  let carries: StatutoryCarryLine[];
  if (PREVIEW_STATUSES.has(run.status)) {
    const settled =
      instalments.size === 0
        ? []
        : await db.payrollReconciliation.findMany({
            where: { id: { in: [...instalments.keys()] } },
            include: { employee: employeeSelect },
          });
    // A regular run's approval also declares open statutory-only items, and
    // items settled by a recorded receipt (money collected outside payroll).
    const statutoryOnly =
      run.type === 'REGULAR'
        ? await db.payrollReconciliation.findMany({
            where: {
              companyId: run.companyId,
              direction: 'STATUTORY_ONLY',
              status: 'OPEN',
              statutoryRunId: null,
            },
            include: { employee: employeeSelect },
          })
        : [];
    const receiptSettled =
      run.type === 'REGULAR'
        ? await db.payrollReconciliation.findMany({
            where: {
              companyId: run.companyId,
              direction: { not: 'STATUTORY_ONLY' },
              statutoryRunId: null,
              receipts: { some: {} },
            },
            include: { employee: employeeSelect },
          })
        : [];
    const items = [...settled, ...statutoryOnly, ...receiptSettled];
    carries = itemsToCarry(
      items.map((item) => ({
        ...item,
        incomeTaxDifference: num(item.incomeTaxDifference),
        employeePensionDifference: num(item.employeePensionDifference),
        employerPensionDifference: num(item.employerPensionDifference),
      })),
    ).map((item) => ({
      reconciliationId: item.id,
      employeeId: item.employeeId,
      employeeName: employeeName(item.employee),
      employeeCode: item.employee.employeeId,
      forMonth: item.forMonth,
      forYear: item.forYear,
      incomeTax: item.incomeTaxDifference,
      pensionEmployee: item.employeePensionDifference,
      pensionEmployer: item.employerPensionDifference,
      instalmentCount: instalments.get(item.id) ?? null,
      pending: true,
    }));
  } else {
    const rows = await db.payrollStatutoryAdjustment.findMany({
      where: { payrollRunId: run.id },
      include: {
        reconciliation: { select: { employee: employeeSelect } },
      },
      orderBy: [{ forYear: 'asc' }, { forMonth: 'asc' }],
    });
    carries = rows.map((row) => ({
      reconciliationId: row.reconciliationId,
      employeeId: row.employeeId,
      employeeName: employeeName(row.reconciliation.employee),
      employeeCode: row.reconciliation.employee.employeeId,
      forMonth: row.forMonth,
      forYear: row.forYear,
      incomeTax: num(row.incomeTax),
      pensionEmployee: num(row.pensionEmployee),
      pensionEmployer: num(row.pensionEmployer),
      instalmentCount: instalments.get(row.reconciliationId) ?? null,
      pending: false,
    }));
  }
  return buildRemittance(base, carries);
}
