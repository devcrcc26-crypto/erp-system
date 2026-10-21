import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import type {
  PurchaseRequestDocumentSummary,
  PurchaseRequestItem,
  PurchaseRequestStatus,
  PurchaseRequestUserSummary,
} from '@/lib/api/purchase-request.types';
import { formatEtbAmount, formatCurrencyAmount } from '@/lib/utils/expense-claim-display';
import { formatUserName } from '@/lib/utils/user-display';

export { formatEtbAmount, formatCurrencyAmount };

type TFn = (key: string, vars?: Record<string, string | number>) => string;

export const PURCHASE_REQUEST_STATUS_OPTIONS: Array<{
  value: PurchaseRequestStatus;
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

export function formatPurchaseRequestStatus(status: string, t?: TFn): string {
  if (t) return t(`hr.status.${status}`);
  const found = PURCHASE_REQUEST_STATUS_OPTIONS.find((o) => o.value === status);
  return found?.label ?? status;
}

export function purchaseRequestStatusVariant(
  status: PurchaseRequestStatus | string,
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

export function formatPurchaseRequestEmployeeName(
  user?: PurchaseRequestUserSummary | null,
): string {
  if (!user) return '-';
  return formatUserName(user);
}

/** Returns the total ETB threshold for PR approval tier routing. */
export const PR_GM_THRESHOLD_ETB = 10_000;

/** Determines if a PR amount requires GM-level approval. */
export function requiresGmApproval(totalEtb: number | string | null | undefined): boolean {
  if (totalEtb == null || totalEtb === '') return false;
  const num = typeof totalEtb === 'string' ? Number(totalEtb) : totalEtb;
  return !Number.isNaN(num) && num > PR_GM_THRESHOLD_ETB;
}

/** Formats description with optional model/spec in brackets. */
export function formatPurchaseItemDescription(
  description?: string | null,
  modelSpec?: string | null,
): string {
  const desc = description?.trim();
  const spec = modelSpec?.trim();
  if (desc && spec) {
    return `${desc} (${spec})`;
  }
  return desc || spec || '-';
}

/** Formats combined description + model/spec for a single form input. */
export function formatPurchaseItemDescriptionInput(
  description?: string | null,
  modelSpec?: string | null,
): string {
  const desc = description?.trim();
  const spec = modelSpec?.trim();
  if (desc && spec) {
    return `${desc} (${spec})`;
  }
  return desc || spec || '';
}

/** Parses "Description (Model Spec)" from a single form input. */
export function parsePurchaseItemDescription(combined?: string | null): {
  description?: string;
  modelSpec?: string;
} {
  const trimmed = combined?.trim();
  if (!trimmed) {
    return {};
  }

  const match = trimmed.match(/^(.+?)\s*\(([^()]+)\)\s*$/);
  if (match) {
    const description = match[1].trim();
    const modelSpec = match[2].trim();
    return {
      description: description || undefined,
      modelSpec: modelSpec || undefined,
    };
  }

  return { description: trimmed };
}

/** Line item images from API (`images` array or legacy single `image`). */
export function purchaseRequestItemImages(
  item: PurchaseRequestItem,
): PurchaseRequestDocumentSummary[] {
  if (item.images && item.images.length > 0) {
    return item.images;
  }
  return item.image ? [item.image] : [];
}
