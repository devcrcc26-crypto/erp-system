import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import type { AuditLog, AuditLogSource } from '@/lib/api/types';
import { formatUserName } from '@/lib/utils/user-display';

export function formatAuditLogUserName(log: AuditLog): string {
  if (!log.user) {
    return '-';
  }
  return formatUserName(log.user);
}

/**
 * 'Submitted by Y for X' (on-behalf create) or 'Approved by Y on behalf of Z'
 * / 'Returned by Y on behalf of Z' (approve / return on behalf) from the
 * entry's afterValue; null for other entries.
 */
export function formatAuditLogOnBehalfSummary(
  log: AuditLog,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string | null {
  const after = log.afterValue as Record<string, unknown> | null | undefined;
  if (!after || typeof after !== 'object') {
    return null;
  }
  const text = (value: unknown): string =>
    typeof value === 'string' && value.trim() ? value : '-';
  if (log.action === 'approve_on_behalf' || log.action === 'return_on_behalf') {
    return t(
      log.action === 'approve_on_behalf'
        ? 'pages.approvals.approvedOnBehalf'
        : 'pages.approvals.returnedOnBehalf',
      {
        by: text(after.actingApproverName),
        for: text(after.onBehalfOfApproverName),
      },
    );
  }
  if (log.action === 'CREATE_ON_BEHALF' && after.onBehalfOfName) {
    return t('pages.approvals.submittedByFor', {
      by: text(after.createdByName),
      for: text(after.onBehalfOfName),
    });
  }
  return null;
}

export function auditLogSourceVariant(
  source: AuditLogSource,
): StatusBadgeVariant {
  switch (source) {
    case 'USER_ACTION':
      return 'info';
    case 'SYSTEM_JOB':
      return 'warning';
    case 'API_INTEGRATION':
      return 'success';
    case 'MIGRATION':
    default:
      return 'default';
  }
}

export function auditLogActionVariant(action: string): StatusBadgeVariant {
  const normalized = action.toLowerCase();
  if (normalized.includes('create') || normalized.includes('insert')) {
    return 'success';
  }
  if (normalized.includes('delete') || normalized.includes('remove')) {
    return 'error';
  }
  if (normalized.includes('update') || normalized.includes('edit')) {
    return 'info';
  }
  return 'default';
}

export function formatAuditLogSourceLabel(
  source: AuditLogSource,
  t: (key: string) => string,
): string {
  const key = `auditLogs.source.${source}`;
  const translated = t(key);
  return translated === key ? source.replace(/_/g, ' ') : translated;
}
