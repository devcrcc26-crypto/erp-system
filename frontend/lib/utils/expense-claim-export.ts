import type {
  ExpenseClaimDetail,
  ExpenseClaimListItem,
} from '@/lib/api/expense-claim.types';
import type { HrExportSheet } from '@/lib/utils/hr-export-excel';
import {
  exportCell,
  exportDate,
  exportDateTime,
  exportEnumLabel,
  exportEtb,
  exportNumber,
  exportPersonName,
} from '@/lib/utils/hr-export-excel';

/**
 * Excel export for expense claims, with a second sheet of the claim items
 * keyed by claim number.
 */
export function buildExpenseClaimExportSheets(
  rows: ExpenseClaimListItem[],
  details?: ExpenseClaimDetail[],
): HrExportSheet[] {
  const detailByClaimId = new Map(
    (details ?? []).map((detail) => [detail.id, detail] as const),
  );

  return [
    {
      name: 'Expense Claims',
      columns: [
        { header: 'Claim Number', key: 'claimNumber', width: 18 },
        { header: 'Employee', key: 'employee', width: 24 },
        { header: 'Employee Email', key: 'employeeEmail', width: 28 },
        { header: 'Title', key: 'title', width: 30 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Items', key: 'itemCount', width: 10 },
        { header: 'Total Amount (ETB)', key: 'totalAmountEtb', width: 20 },
        { header: 'Submitted At', key: 'submittedAt', width: 18 },
        { header: 'Created At', key: 'createdAt', width: 18 },
      ],
      rows: rows.map((row) => ({
        claimNumber: exportCell(row.claimNumber),
        employee: exportPersonName(row.employee),
        employeeEmail: exportCell(row.employee?.email),
        title: exportCell(row.title),
        status: exportEnumLabel(row.status),
        itemCount: exportNumber(row.itemCount),
        totalAmountEtb: exportEtb(row.totalAmountEtb),
        submittedAt: exportDateTime(row.submittedAt),
        createdAt: exportDateTime(row.createdAt),
      })),
    },
    {
      name: 'Items',
      columns: [
        { header: 'Claim Number', key: 'claimNumber', width: 18 },
        { header: 'Employee', key: 'employee', width: 24 },
        { header: 'Category', key: 'category', width: 18 },
        { header: 'Description', key: 'description', width: 40 },
        { header: 'Expense Date', key: 'expenseDate', width: 16 },
        { header: 'Amount', key: 'amount', width: 14 },
        { header: 'Currency', key: 'currency', width: 12 },
        { header: 'Amount (ETB)', key: 'amountEtb', width: 16 },
        { header: 'Exchange Rate', key: 'exchangeRate', width: 16 },
      ],
      rows: rows.flatMap((row) => {
        const items = detailByClaimId.get(row.id)?.items ?? [];
        return items.map((item) => ({
          claimNumber: exportCell(row.claimNumber),
          employee: exportPersonName(row.employee),
          category: exportEnumLabel(item.category),
          description: exportCell(item.description),
          expenseDate: exportDate(item.expenseDate),
          amount: exportNumber(item.amount),
          currency: exportCell(item.currency),
          amountEtb: exportEtb(item.amountEtb),
          exchangeRate: exportNumber(item.exchangeRate),
        }));
      }),
    },
  ];
}
