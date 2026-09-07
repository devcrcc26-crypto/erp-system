import type {
  ExpenseClaimDetail,
  ExpenseClaimItem,
  ExpenseClaimListItem,
} from '@/lib/api/expense-claim.types';
import {
  buildExportFileName,
  cell,
  downloadExcelWorkbook,
  formatExportDate,
} from '@/lib/utils/excel-export';
import { formatExpenseClaimEmployeeName } from '@/lib/utils/expense-claim-display';

/**
 * Downloads expense claim list rows as Excel (summary table).
 */
export async function exportExpenseClaimsExcel(input: {
  companyName: string;
  sheetName: string;
  rows: ExpenseClaimListItem[];
}): Promise<void> {
  const { rows, companyName, sheetName } = input;
  await downloadExcelWorkbook({
    sheetName,
    fileName: buildExportFileName('expense-claims', companyName),
    columns: [
      { header: 'claimNumber', key: 'claimNumber', width: 16 },
      { header: 'employeeEmail', key: 'employeeEmail', width: 28 },
      { header: 'employeeName', key: 'employeeName', width: 22 },
      { header: 'employeeId', key: 'employeeId', width: 36 },
      { header: 'title', key: 'title', width: 28 },
      { header: 'status', key: 'status', width: 12 },
      { header: 'itemCount', key: 'itemCount', width: 10 },
      { header: 'totalAmountEtb', key: 'totalAmountEtb', width: 14 },
      { header: 'submittedAt', key: 'submittedAt', width: 14 },
      { header: 'createdAt', key: 'createdAt', width: 14 },
    ],
    rows: rows.map((row) => ({
      claimNumber: cell(row.claimNumber),
      employeeEmail: cell(row.employee?.email),
      employeeName: formatExpenseClaimEmployeeName(row.employee),
      employeeId: cell(row.employeeId),
      title: cell(row.title),
      status: cell(row.status),
      itemCount: cell(row.itemCount),
      totalAmountEtb: cell(row.totalAmountEtb),
      submittedAt: formatExportDate(row.submittedAt),
      createdAt: formatExportDate(row.createdAt),
    })),
  });
}

/**
 * Downloads expense claim items flattened from claims (import-compatible).
 */
export async function exportExpenseClaimItemsExcel(input: {
  companyName: string;
  sheetName: string;
  filePrefix?: string;
  claims: ExpenseClaimDetail[];
}): Promise<void> {
  const { claims, companyName, sheetName, filePrefix } = input;
  const flatRows: Array<Record<string, string | number>> = [];

  for (const claim of claims) {
    for (const item of claim.items ?? []) {
      flatRows.push(mapItemExportRow(claim, item));
    }
  }

  await downloadExcelWorkbook({
    sheetName,
    fileName: buildExportFileName(
      filePrefix ?? 'expense-claim-items',
      companyName,
    ),
    columns: [
      { header: 'employeeEmail', key: 'employeeEmail', width: 28 },
      { header: 'employeeName', key: 'employeeName', width: 22 },
      { header: 'employeeId', key: 'employeeId', width: 36 },
      { header: 'claimNumber', key: 'claimNumber', width: 16 },
      { header: 'title', key: 'title', width: 28 },
      { header: 'claimDescription', key: 'claimDescription', width: 28 },
      { header: 'status', key: 'status', width: 12 },
      { header: 'category', key: 'category', width: 16 },
      { header: 'description', key: 'description', width: 32 },
      { header: 'expenseDate', key: 'expenseDate', width: 14 },
      { header: 'amount', key: 'amount', width: 12 },
      { header: 'currency', key: 'currency', width: 10 },
      { header: 'amountEtb', key: 'amountEtb', width: 12 },
      { header: 'exchangeRate', key: 'exchangeRate', width: 12 },
    ],
    rows: flatRows,
  });
}

/**
 * Downloads items for a single expense claim (claim-scoped import columns).
 */
export async function exportExpenseClaimDetailItemsExcel(input: {
  companyName: string;
  sheetName: string;
  claim: ExpenseClaimDetail;
}): Promise<void> {
  const { claim, companyName, sheetName } = input;
  await downloadExcelWorkbook({
    sheetName,
    fileName: buildExportFileName(
      `expense-claim-${claim.claimNumber || claim.id.slice(0, 8)}`,
      companyName,
    ),
    columns: [
      { header: 'category', key: 'category', width: 16 },
      { header: 'description', key: 'description', width: 32 },
      { header: 'expenseDate', key: 'expenseDate', width: 14 },
      { header: 'amount', key: 'amount', width: 12 },
      { header: 'currency', key: 'currency', width: 10 },
      { header: 'amountEtb', key: 'amountEtb', width: 12 },
      { header: 'exchangeRate', key: 'exchangeRate', width: 12 },
    ],
    rows: (claim.items ?? []).map((item) => ({
      category: cell(item.category),
      description: cell(item.description),
      expenseDate: formatExportDate(item.expenseDate),
      amount: cell(item.amount),
      currency: cell(item.currency),
      amountEtb: cell(item.amountEtb),
      exchangeRate: cell(item.exchangeRate),
    })),
  });
}

function mapItemExportRow(
  claim: ExpenseClaimDetail,
  item: ExpenseClaimItem,
): Record<string, string | number> {
  return {
    employeeEmail: cell(claim.employee?.email),
    employeeName: formatExpenseClaimEmployeeName(claim.employee),
    employeeId: cell(claim.employeeId),
    claimNumber: cell(claim.claimNumber),
    title: cell(claim.title),
    claimDescription: cell(claim.description),
    status: cell(claim.status),
    category: cell(item.category),
    description: cell(item.description),
    expenseDate: formatExportDate(item.expenseDate),
    amount: cell(item.amount),
    currency: cell(item.currency),
    amountEtb: cell(item.amountEtb),
    exchangeRate: cell(item.exchangeRate),
  };
}
