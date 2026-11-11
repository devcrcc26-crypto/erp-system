import type { EmployeeContractListItem } from '@/lib/api/employee-contract.types';
import {
  buildExportFileName,
  cell,
  downloadExcelWorkbook,
  formatExportDate,
} from '@/lib/utils/excel-export';
import { formatEmployeeContractEmployeeName } from '@/lib/utils/employee-contract-display';

/**
 * Downloads employee contracts as Excel (import-compatible camelCase headers).
 */
export async function exportEmployeeContractsExcel(input: {
  companyName: string;
  sheetName: string;
  rows: EmployeeContractListItem[];
}): Promise<void> {
  const { rows, companyName, sheetName } = input;
  await downloadExcelWorkbook({
    sheetName,
    fileName: buildExportFileName('employee-contracts', companyName),
    columns: [
      { header: 'contractNumber', key: 'contractNumber', width: 16 },
      { header: 'employeeEmail', key: 'employeeEmail', width: 28 },
      { header: 'employeeName', key: 'employeeName', width: 22 },
      { header: 'employeeId', key: 'employeeId', width: 36 },
      { header: 'contractType', key: 'contractType', width: 14 },
      { header: 'status', key: 'status', width: 12 },
      { header: 'signedAt', key: 'signedAt', width: 12 },
      { header: 'startDate', key: 'startDate', width: 12 },
      { header: 'endDate', key: 'endDate', width: 12 },
      { header: 'currency', key: 'currency', width: 10 },
      { header: 'basicSalary', key: 'basicSalary', width: 14 },
      {
        header: 'transportationAllowance',
        key: 'transportationAllowance',
        width: 18,
      },
      { header: 'monthlyBonus', key: 'monthlyBonus', width: 14 },
      { header: 'monthlyNetBonus', key: 'monthlyNetBonus', width: 16 },
      { header: 'probationEndDate', key: 'probationEndDate', width: 14 },
      { header: 'governedBy', key: 'governedBy', width: 28 },
      { header: 'notes', key: 'notes', width: 28 },
    ],
    rows: rows.map((row) => ({
      contractNumber: cell(row.contractNumber),
      employeeEmail: cell(row.employee?.email),
      employeeName: formatEmployeeContractEmployeeName(row.employee),
      employeeId: cell(row.employeeId),
      contractType: cell(row.contractType),
      status: cell(row.status),
      signedAt: formatExportDate(row.signedAt),
      startDate: formatExportDate(row.startDate),
      endDate: formatExportDate(row.endDate),
      currency: cell(row.currency ?? 'ETB'),
      basicSalary: cell(row.basicSalary),
      transportationAllowance: cell(row.transportationAllowance),
      monthlyBonus: cell(row.monthlyBonus),
      monthlyNetBonus: cell(row.monthlyNetBonus),
      probationEndDate: formatExportDate(row.probationEndDate),
      governedBy: cell(row.governedBy),
      notes: cell(row.notes),
    })),
  });
}
