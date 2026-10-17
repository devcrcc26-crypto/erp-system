import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import type {
  ApprovalFormField,
  ApprovalFormSchema,
  ApprovalRequestStatus,
  ApprovalTier,
  ApprovalTierCondition,
  ApprovalTierDecision,
  ApprovalUserSummary,
} from '@/lib/api/approvals.types';
import { formatUserName } from '@/lib/utils/user-display';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

export function formatApprovalUserName(
  user?: ApprovalUserSummary | null,
): string {
  if (!user) {
    return '-';
  }
  return formatUserName(user) || user.email || '-';
}

/**
 * "Submitted by Y for X" (plus the capacity) when someone filed the request for
 * the subject employee; null for self-submissions.
 */
export function formatSubmittedFor(
  request: {
    requestedBy: string;
    createdBy?: string;
    requester?: ApprovalUserSummary | null;
    creator?: ApprovalUserSummary | null;
    initiatedAs?: 'SELF' | 'SUPERVISOR' | 'DELEGATE' | null;
  },
  t: TFn,
): string | null {
  if (!request.createdBy || request.createdBy === request.requestedBy || !request.creator) {
    return null;
  }
  const text = t('pages.approvals.submittedByFor', {
    by: formatApprovalUserName(request.creator),
    for: formatApprovalUserName(request.requester),
  });
  return request.initiatedAs === 'SUPERVISOR' || request.initiatedAs === 'DELEGATE'
    ? `${text} (${t(`pages.approvals.initiatedAs.${request.initiatedAs}`)})`
    : text;
}

/**
 * "Approved by Y on behalf of Z" / "Returned by Y on behalf of Z" for a tier a
 * full-access user acted on; else null.
 */
export function formatApprovedOnBehalf(
  tier: Pick<ApprovalTier, 'actingApprover' | 'onBehalfOfApprover'> & {
    decision?: ApprovalTier['decision'];
  },
  t: TFn,
): string | null {
  if (!tier.actingApprover) {
    return null;
  }
  const key =
    tier.decision === 'RETURNED'
      ? 'pages.approvals.returnedOnBehalf'
      : 'pages.approvals.approvedOnBehalf';
  return t(key, {
    by: formatApprovalUserName(tier.actingApprover),
    for: formatApprovalUserName(tier.onBehalfOfApprover),
  });
}

export function formatApprovalStatus(status: string, t?: TFn): string {
  if (t) {
    const decisionKey = `hr.approvalDecision.${status}`;
    const decision = t(decisionKey);
    if (decision !== decisionKey) {
      return decision;
    }
    return t(`hr.status.${status}`);
  }
  return status
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

export function approvalRequestStatusVariant(
  status: ApprovalRequestStatus | string,
): StatusBadgeVariant {
  switch (status) {
    case 'APPROVED':
      return 'success';
    case 'REJECTED':
    case 'CANCELLED':
      return 'error';
    case 'RETURNED':
      return 'orange';
    case 'PENDING':
    case 'SUBMITTED':
    case 'IN_REVIEW':
      return 'warning';
    case 'DRAFT':
      return 'default';
    default:
      return 'default';
  }
}

export function approvalTierDecisionVariant(
  decision: ApprovalTierDecision | string,
): StatusBadgeVariant {
  switch (decision) {
    case 'APPROVED':
      return 'success';
    case 'REJECTED':
      return 'error';
    case 'RETURNED':
      return 'orange';
    case 'CONDITIONALLY_APPROVED':
      return 'info';
    case 'SKIPPED':
      return 'default';
    case 'PENDING':
    default:
      return 'warning';
  }
}

/**
 * Display status for list rows - prefer current-tier conditional state when active.
 */
export function resolveDisplayStatus(
  requestStatus: ApprovalRequestStatus,
  currentTier?: ApprovalTier | null,
  t?: TFn,
): { label: string; variant: StatusBadgeVariant; raw: string } {
  if (
    currentTier?.decision === 'CONDITIONALLY_APPROVED' &&
    (requestStatus === 'PENDING' ||
      requestStatus === 'IN_REVIEW' ||
      requestStatus === 'SUBMITTED')
  ) {
    return {
      raw: 'CONDITIONALLY_APPROVED',
      label: formatApprovalStatus('CONDITIONALLY_APPROVED', t),
      variant: 'info',
    };
  }
  return {
    raw: requestStatus,
    label: formatApprovalStatus(requestStatus, t),
    variant: approvalRequestStatusVariant(requestStatus),
  };
}

export function findCurrentTier(
  tiers: ApprovalTier[] | undefined,
  currentTier: number,
): ApprovalTier | undefined {
  if (!tiers || tiers.length === 0) {
    return undefined;
  }
  return (
    tiers.find((tier) => tier.tierOrder === currentTier) ??
    tiers.find((tier) => tier.decision === 'PENDING')
  );
}

export function parseTierConditions(
  raw: ApprovalTier['conditions'],
): ApprovalTierCondition[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter(
      (item): item is ApprovalTierCondition =>
        !!item &&
        typeof item === 'object' &&
        typeof (item as ApprovalTierCondition).text === 'string',
    )
    .map((item) => ({
      text: item.text,
      resolved: Boolean(item.resolved),
      createdBy: item.createdBy ?? '',
      createdAt: item.createdAt ?? '',
      resolvedBy: item.resolvedBy,
      resolvedAt: item.resolvedAt,
    }));
}

export function getFormFieldLabels(
  formSchema: ApprovalFormSchema | ApprovalFormField[] | null | undefined,
): Map<string, string> {
  const map = new Map<string, string>();
  const fields = Array.isArray(formSchema)
    ? formSchema
    : formSchema?.fields ?? [];
  for (const field of fields) {
    if (field?.name) {
      map.set(field.name, field.label || field.name);
    }
  }
  return map;
}

export function formatFormDataValue(value: unknown, t?: TFn): string {
  if (value === null || value === undefined || value === '') {
    return '-';
  }
  if (typeof value === 'boolean') {
    return value
      ? (t?.('hr.labels.yes') ?? 'Yes')
      : (t?.('hr.labels.no') ?? 'No');
  }
  if (Array.isArray(value)) {
    return value.map((item) => formatFormDataValue(item, t)).join(', ');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}
