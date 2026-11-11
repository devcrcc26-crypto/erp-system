import type { EmployeeContractListItem } from '@/lib/api/employee-contract.types';
import type { HrExportSheet } from '@/lib/utils/hr-export-excel';
import {
  exportCell,
  exportDate,
  exportDateTime,
  exportEnumLabel,
  exportEtb,
  exportPersonName,
} from '@/lib/utils/hr-export-excel';

/**
 * Excel export for employee contracts.
 */
export function buildEmployeeContractExportSheets(
  rows: EmployeeContractListItem[],
): HrExportSheet[] {
  return [
    {
      name: 'Employee Contracts',
      columns: [
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
        { header: 'Basic Salary (ETB)', key: 'basicSalary', width: 18 },
        {
          header: 'Transportation Allowance (ETB)',
          key: 'transportationAllowance',
          width: 28,
        },
        { header: 'Monthly Bonus (ETB)', key: 'monthlyBonus', width: 20 },
        { header: 'Monthly Net Bonus (ETB)', key: 'monthlyNetBonus', width: 22 },
        { header: 'Governed By', key: 'governedBy', width: 28 },
        { header: 'Notes', key: 'notes', width: 36 },
        { header: 'Created At', key: 'createdAt', width: 18 },
      ],
      rows: rows.map((row) => ({
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
        governedBy: exportCell(row.governedBy),
        notes: exportCell(row.notes),
        createdAt: exportDateTime(row.createdAt),
      })),
    },
  ];
}
