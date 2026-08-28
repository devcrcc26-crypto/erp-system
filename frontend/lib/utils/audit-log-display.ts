import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import type { AuditLog, AuditLogSource } from '@/lib/api/types';
import { formatUserName } from '@/lib/utils/user-display';

export function formatAuditLogUserName(log: AuditLog): string {
  if (!log.user) {
    return '—';
  }
  return formatUserName(log.user);
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
