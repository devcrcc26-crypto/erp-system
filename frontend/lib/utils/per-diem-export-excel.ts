import type { PerDiemRequestListItem } from '@/lib/api/per-diem.types';
import {
  buildExportFileName,
  cell,
  downloadExcelWorkbook,
  formatExportDate,
} from '@/lib/utils/excel-export';
import { formatPerDiemEmployeeName } from '@/lib/utils/per-diem-display';

/**
 * Downloads per diem requests as Excel (import-compatible camelCase headers).
 */
export async function exportPerDiemRequestsExcel(input: {
  companyName: string;
  sheetName: string;
  rows: PerDiemRequestListItem[];
}): Promise<void> {
  const { rows, companyName, sheetName } = input;
  await downloadExcelWorkbook({
    sheetName,
    fileName: buildExportFileName('per-diem-requests', companyName),
    columns: [
      { header: 'requestNumber', key: 'requestNumber', width: 16 },
      { header: 'employeeEmail', key: 'employeeEmail', width: 28 },
      { header: 'employeeName', key: 'employeeName', width: 22 },
      { header: 'employeeId', key: 'employeeId', width: 36 },
      { header: 'destinationCategory', key: 'destinationCategory', width: 18 },
      { header: 'destination', key: 'destination', width: 22 },
      { header: 'startDate', key: 'startDate', width: 12 },
      { header: 'endDate', key: 'endDate', width: 12 },
      { header: 'days', key: 'days', width: 8 },
      { header: 'dailyRate', key: 'dailyRate', width: 12 },
      { header: 'currency', key: 'currency', width: 10 },
      { header: 'totalAmount', key: 'totalAmount', width: 12 },
      { header: 'totalAmountEtb', key: 'totalAmountEtb', width: 14 },
      { header: 'status', key: 'status', width: 12 },
      { header: 'submittedAt', key: 'submittedAt', width: 14 },
      { header: 'createdAt', key: 'createdAt', width: 14 },
    ],
    rows: rows.map((row) => ({
      requestNumber: cell(row.requestNumber),
      employeeEmail: cell(row.employee?.email),
      employeeName: formatPerDiemEmployeeName(row.employee),
      employeeId: cell(row.employeeId),
      destinationCategory: cell(row.destinationCategory),
      destination: cell(row.destination),
      startDate: formatExportDate(row.startDate),
      endDate: formatExportDate(row.endDate),
      days: cell(row.days ?? row.totalDays),
      dailyRate: cell(row.dailyRate),
      currency: cell(row.currency),
      totalAmount: cell(row.totalAmount),
      totalAmountEtb: cell(row.totalAmountEtb),
      status: cell(row.status),
      submittedAt: formatExportDate(row.submittedAt),
      createdAt: formatExportDate(row.createdAt),
    })),
  });
}
