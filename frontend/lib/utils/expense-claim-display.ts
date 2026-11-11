import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import type {
  ExpenseClaimDocumentSummary,
  ExpenseClaimItemReceipt,
  ExpenseClaimStatus,
  ExpenseClaimUserSummary,
} from '@/lib/api/expense-claim.types';
import { formatUserName } from '@/lib/utils/user-display';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

export const EXPENSE_CLAIM_STATUS_OPTIONS: Array<{
  value: ExpenseClaimStatus;
  label: string;
}> = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'IN_REVIEW', label: 'In Review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'RETURNED', label: 'Returned' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export function formatExpenseClaimStatus(status: string, t?: TFn): string {
  if (t) return t(`hr.status.${status}`);
  const found = EXPENSE_CLAIM_STATUS_OPTIONS.find((o) => o.value === status);
  return found?.label ?? status;
}

export function expenseClaimStatusVariant(
  status: ExpenseClaimStatus | string,
): StatusBadgeVariant {
  switch (status) {
    case 'APPROVED':
      return 'success';
    case 'REJECTED':
      return 'error';
    case 'RETURNED':
      return 'warning';
    case 'SUBMITTED':
      return 'info';
    case 'IN_REVIEW':
      return 'warning';
    case 'CANCELLED':
    case 'DRAFT':
    default:
      return 'default';
  }
}

export function formatExpenseClaimEmployeeName(
  user?: ExpenseClaimUserSummary | null,
): string {
  if (!user) {
    return '-';
  }
  return formatUserName(user);
}

/** Formats an amount as Ethiopian Birr for display. */
export function formatEtbAmount(amount: number | string | null | undefined): string {
  if (amount == null || amount === '') {
    return '-';
  }
  const num = typeof amount === 'string' ? Number(amount) : amount;
  if (Number.isNaN(num)) {
    return '-';
  }
  return `ETB ${num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  ETB: 'ETB',
  USD: '$',
  CNY: '¥',
};

export function formatCurrencyAmount(
  amount: number | string | null | undefined,
  currency: string,
): string {
  if (amount == null || amount === '') {
    return '-';
  }
  const num = typeof amount === 'string' ? Number(amount) : amount;
  if (Number.isNaN(num)) {
    return '-';
  }
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
  return `${symbol} ${num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Receipt documents of one expense item (an item can have several). */
export function itemReceiptDocuments(item: {
  receipts?: ExpenseClaimItemReceipt[] | null;
}): ExpenseClaimDocumentSummary[] {
  return (item.receipts ?? []).flatMap((receipt) =>
    receipt.document ? [receipt.document] : [],
  );
}
