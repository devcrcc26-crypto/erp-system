import type { EmployeeContractListItem } from '@/lib/api/employee-contract.types';
import {
  buildExportFileName,
  cell,
  downloadExcelWorkbook,
  formatExportDate,
} from '@/lib/utils/excel-export';
import {
  formatEmployeeContractEmployeeName,
  formatEmployeeContractStatus,
  formatEmployeeContractType,
} from '@/lib/utils/employee-contract-display';

export interface EmployeeContractsExportLabels {
  sheetName: string;
  contractNumber: string;
  employeeEmail: string;
  employeeName: string;
  employeeId: string;
  contractType: string;
  status: string;
  signedAt: string;
  startDate: string;
  endDate: string;
  currency: string;
  basicSalary: string;
  transportationAllowance: string;
  monthlyBonus: string;
  netSalary: string;
  probationEndDate: string;
  governedBy: string;
  notes: string;
}

/**
 * Downloads employee contracts as an Excel file (import-compatible headers).
 */
export async function exportEmployeeContractsExcel(input: {
  companyName: string;
  labels: EmployeeContractsExportLabels;
  rows: EmployeeContractListItem[];
}): Promise<void> {
  const { labels, rows, companyName } = input;
  await downloadExcelWorkbook({
    sheetName: labels.sheetName,
    fileName: buildExportFileName('employee-contracts', companyName),
    columns: [
      { header: labels.contractNumber, key: 'contractNumber', width: 16 },
      { header: labels.employeeEmail, key: 'employeeEmail', width: 28 },
      { header: labels.employeeName, key: 'employeeName', width: 22 },
      { header: labels.employeeId, key: 'employeeId', width: 36 },
      { header: labels.contractType, key: 'contractType', width: 14 },
      { header: labels.status, key: 'status', width: 12 },
      { header: labels.signedAt, key: 'signedAt', width: 12 },
      { header: labels.startDate, key: 'startDate', width: 12 },
      { header: labels.endDate, key: 'endDate', width: 12 },
      { header: labels.currency, key: 'currency', width: 10 },
      { header: labels.basicSalary, key: 'basicSalary', width: 14 },
      {
        header: labels.transportationAllowance,
        key: 'transportationAllowance',
        width: 18,
      },
      { header: labels.monthlyBonus, key: 'monthlyBonus', width: 14 },
      { header: labels.netSalary, key: 'netSalary', width: 14 },
      { header: labels.probationEndDate, key: 'probationEndDate', width: 14 },
      { header: labels.governedBy, key: 'governedBy', width: 28 },
      { header: labels.notes, key: 'notes', width: 28 },
    ],
    rows: rows.map((row) => ({
      contractNumber: cell(row.contractNumber),
      employeeEmail: cell(row.employee?.email),
      employeeName: formatEmployeeContractEmployeeName(row.employee),
      employeeId: cell(row.employeeId),
      contractType: formatEmployeeContractType(row.contractType),
      status: formatEmployeeContractStatus(row.status),
      signedAt: formatExportDate(row.signedAt),
      startDate: formatExportDate(row.startDate),
      endDate: formatExportDate(row.endDate),
      currency: cell(row.currency ?? 'ETB'),
      basicSalary: cell(row.basicSalary),
      transportationAllowance: cell(row.transportationAllowance),
      monthlyBonus: cell(row.monthlyBonus),
      netSalary: cell(row.netSalary),
      probationEndDate: formatExportDate(row.probationEndDate),
      governedBy: cell(row.governedBy),
      notes: cell(row.notes),
    })),
  });
}
