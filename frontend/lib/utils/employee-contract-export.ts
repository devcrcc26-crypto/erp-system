import type { EmployeeContractListItem } from '@/lib/api/employee-contract.types';
import type { HrExportColumn, HrExportSheet } from '@/lib/utils/hr-export-excel';
import {
  exportCell,
  exportDate,
  exportDateTime,
  exportEnumLabel,
  exportEtb,
  exportPersonName,
} from '@/lib/utils/hr-export-excel';

export interface EmployeeContractExportOptions {
  /**
   * Include pay columns. Must be false for users without
   * contracts.view_salary so no salary data leaves the browser.
   */
  includeSalary: boolean;
}

const SALARY_KEYS = [
  'basicSalary',
  'transportationAllowance',
  'monthlyBonus',
  'monthlyNetBonus',
  'packageTotal',
  'overrideAmount',
  'overrideEffectiveFrom',
] as const;

const SALARY_COLUMNS: HrExportColumn[] = [
  { header: 'Basic Salary (ETB)', key: 'basicSalary', width: 18 },
  {
    header: 'Transportation Allowance (ETB)',
    key: 'transportationAllowance',
    width: 28,
  },
  { header: 'Monthly Bonus (ETB)', key: 'monthlyBonus', width: 20 },
  { header: 'Monthly Net Bonus (ETB)', key: 'monthlyNetBonus', width: 22 },
  { header: 'Package Total (ETB)', key: 'packageTotal', width: 20 },
  { header: 'Active Override (ETB)', key: 'overrideAmount', width: 22 },
  {
    header: 'Override Effective From',
    key: 'overrideEffectiveFrom',
    width: 22,
  },
];

/**
 * Excel export for employee contracts. Salary columns are only emitted when
 * `options.includeSalary` is true.
 */
export function buildEmployeeContractExportSheets(
  rows: EmployeeContractListItem[],
  options: EmployeeContractExportOptions,
): HrExportSheet[] {
  const { includeSalary } = options;
  const salaryKeys: ReadonlySet<string> = new Set(SALARY_KEYS);

  const leadingColumns: HrExportColumn[] = [
    { header: 'Contract Number', key: 'contractNumber', width: 18 },
    { header: 'Employee', key: 'employee', width: 24 },
    { header: 'Employee Email', key: 'employeeEmail', width: 28 },
    { header: 'Contract Type', key: 'contractType', width: 16 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Signed At', key: 'signedAt', width: 14 },
    { header: 'Start Date', key: 'startDate', width: 14 },
    { header: 'End Date', key: 'endDate', width: 14 },
    { header: 'Probation End Date', key: 'probationEndDate', width: 18 },
    { header: 'Currency', key: 'currency', width: 12 },
  ];
  const trailingColumns: HrExportColumn[] = [
    { header: 'Governed By', key: 'governedBy', width: 28 },
    { header: 'Notes', key: 'notes', width: 36 },
    { header: 'Created At', key: 'createdAt', width: 18 },
  ];

  return [
    {
      name: 'Employee Contracts',
      columns: [
        ...leadingColumns,
        ...(includeSalary ? SALARY_COLUMNS : []),
        ...trailingColumns,
      ],
      rows: rows.map((row) => {
        const record: Record<string, string | number> = {
          contractNumber: exportCell(row.contractNumber),
          employee: exportPersonName(row.employee),
          employeeEmail: exportCell(row.employee?.email),
          contractType: exportEnumLabel(row.contractType),
          status: exportEnumLabel(row.status),
          signedAt: exportDate(row.signedAt),
          startDate: exportDate(row.startDate),
          endDate: exportDate(row.endDate),
          probationEndDate: exportDate(row.probationEndDate),
          currency: exportCell(row.currency ?? 'ETB'),
          basicSalary: exportEtb(row.basicSalary),
          transportationAllowance: exportEtb(row.transportationAllowance),
          monthlyBonus: exportEtb(row.monthlyBonus),
          monthlyNetBonus: exportEtb(row.monthlyNetBonus),
          packageTotal: exportEtb(row.packageTotal),
          overrideAmount: exportEtb(row.activeSalaryOverride?.amount),
          overrideEffectiveFrom: exportDate(
            row.activeSalaryOverride?.effectiveFrom,
          ),
          governedBy: exportCell(row.governedBy),
          notes: exportCell(row.notes),
          createdAt: exportDateTime(row.createdAt),
        };
        if (includeSalary) {
          return record;
        }
        return Object.fromEntries(
          Object.entries(record).filter(([key]) => !salaryKeys.has(key)),
        );
      }),
    },
  ];
}
