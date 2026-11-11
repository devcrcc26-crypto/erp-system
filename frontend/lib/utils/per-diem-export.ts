import type {
  EmployeePerDiemRateListItem,
  PerDiemRequestListItem,
} from '@/lib/api/per-diem.types';
import type { HrExportSheet } from '@/lib/utils/hr-export-excel';
import {
  exportBoolean,
  exportCell,
  exportDate,
  exportDateTime,
  exportEnumLabel,
  exportEtb,
  exportNumber,
  exportPersonName,
} from '@/lib/utils/hr-export-excel';

/**
 * Excel export for per diem requests.
 */
export function buildPerDiemRequestExportSheets(
  rows: PerDiemRequestListItem[],
): HrExportSheet[] {
  return [
    {
      name: 'Per Diem Requests',
      columns: [
        { header: 'Request Number', key: 'requestNumber', width: 18 },
        { header: 'Employee', key: 'employee', width: 24 },
        { header: 'Employee Email', key: 'employeeEmail', width: 28 },
        {
          header: 'Destination Category',
          key: 'destinationCategory',
          width: 22,
        },
        { header: 'Destination', key: 'destination', width: 24 },
        { header: 'Start Date', key: 'startDate', width: 14 },
        { header: 'End Date', key: 'endDate', width: 14 },
        { header: 'Days', key: 'days', width: 10 },
        { header: 'Daily Rate', key: 'dailyRate', width: 14 },
        { header: 'Currency', key: 'currency', width: 12 },
        { header: 'Total Amount', key: 'totalAmount', width: 16 },
        { header: 'Total Amount (ETB)', key: 'totalAmountEtb', width: 20 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Submitted At', key: 'submittedAt', width: 18 },
        { header: 'Completed At', key: 'completedAt', width: 18 },
        { header: 'Created At', key: 'createdAt', width: 18 },
      ],
      rows: rows.map((row) => ({
        requestNumber: exportCell(row.requestNumber),
        employee: exportPersonName(row.employee),
        employeeEmail: exportCell(row.employee?.email),
        destinationCategory: exportEnumLabel(row.destinationCategory),
        destination: exportCell(row.destination),
        startDate: exportDate(row.startDate),
        endDate: exportDate(row.endDate),
        days: exportNumber(row.days),
        dailyRate: exportNumber(row.dailyRate),
        currency: exportCell(row.currency),
        totalAmount: exportNumber(row.totalAmount),
        totalAmountEtb: exportEtb(row.totalAmountEtb),
        status: exportEnumLabel(row.status),
        submittedAt: exportDateTime(row.submittedAt),
        completedAt: exportDateTime(row.completedAt),
        createdAt: exportDateTime(row.createdAt),
      })),
    },
  ];
}

/** Destination categories in the order the rate form shows them. */
const RATE_CATEGORIES = [
  { label: 'Domestic', rate: 'domesticRate', active: 'domesticActive' },
  { label: 'Regional', rate: 'regionalRate', active: 'regionalActive' },
  {
    label: 'International',
    rate: 'internationalRate',
    active: 'internationalActive',
  },
] as const;

/**
 * Excel export for employee per diem rates: one row per employee with every
 * destination rate, plus a long-form sheet of one row per rate.
 */
export function buildEmployeePerDiemRateExportSheets(
  rows: EmployeePerDiemRateListItem[],
): HrExportSheet[] {
  return [
    {
      name: 'Per Diem Rates',
      columns: [
        { header: 'Employee', key: 'employee', width: 24 },
        { header: 'Employee Email', key: 'employeeEmail', width: 28 },
        { header: 'Department', key: 'department', width: 22 },
        { header: 'Currency', key: 'currency', width: 12 },
        ...RATE_CATEGORIES.flatMap((category) => [
          { header: category.label, key: category.rate, width: 16 },
          {
            header: `${category.label} Active`,
            key: category.active,
            width: 18,
          },
        ]),
        { header: 'Updated At', key: 'updatedAt', width: 18 },
      ],
      rows: rows.map((row) => ({
        employee: exportPersonName(row.employee),
        employeeEmail: exportCell(row.employee.email),
        department: exportCell(row.employee.department?.name),
        currency: exportCell(row.rate?.currency ?? 'ETB'),
        ...Object.fromEntries(
          RATE_CATEGORIES.flatMap((category) => [
            [category.rate, exportEtb(row.rate?.[category.rate])],
            [category.active, exportBoolean(row.rate?.[category.active])],
          ]),
        ),
        updatedAt: exportDateTime(row.rate?.updatedAt),
      })),
    },
    {
      name: 'Rates by Category',
      columns: [
        { header: 'Employee', key: 'employee', width: 24 },
        { header: 'Employee Email', key: 'employeeEmail', width: 28 },
        {
          header: 'Destination Category',
          key: 'destinationCategory',
          width: 22,
        },
        { header: 'Daily Rate (ETB)', key: 'dailyRate', width: 18 },
        { header: 'Active', key: 'active', width: 12 },
        { header: 'Currency', key: 'currency', width: 12 },
      ],
      rows: rows.flatMap((row) =>
        RATE_CATEGORIES.map((category) => ({
          employee: exportPersonName(row.employee),
          employeeEmail: exportCell(row.employee.email),
          destinationCategory: category.label,
          dailyRate: exportEtb(row.rate?.[category.rate]),
          active: exportBoolean(row.rate?.[category.active]),
          currency: exportCell(row.rate?.currency ?? 'ETB'),
        })),
      ),
    },
  ];
}
