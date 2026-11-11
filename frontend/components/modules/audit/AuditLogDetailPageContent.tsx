'use client';

import { Button, Grid, Skeleton } from 'antd';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { MetaItem } from '@/components/modules/hr/shared/hr-page-chrome';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { ApiRequestError } from '@/lib/api/errors';
import { useAuditLog } from '@/lib/query/audit-logs';
import {
  auditLogActionVariant,
  auditLogSourceVariant,
  formatAuditLogSourceLabel,
  formatAuditLogUserName,
} from '@/lib/utils/audit-log-display';
import { formatDisplayDateTime } from '@/lib/utils/date-format';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';

import { DETAIL_PAGE_V2 } from '@/components/ui/list-page-v2';
const LIST_PATH = '/audit-logs';

function DetailSection({
  title,
  children,
  className = '',
  bodyClassName = '',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}): React.ReactNode {
  return (
    <div className={`erp-employee-section ${className}`.trim()}>
      <div className="erp-employee-section-header flex flex-wrap items-center justify-between gap-2">
        <h3 className="erp-employee-section-title m-0">{title}</h3>
      </div>
      <div className={`erp-employee-section-body ${bodyClassName}`.trim()}>
        {children}
      </div>
    </div>
  );
}

function JsonBlock({
  value,
  emptyLabel,
}: {
  value: unknown;
  emptyLabel?: string;
}): React.ReactNode {
  if (value === null || value === undefined) {
    return (
      <div className="rounded-xl border border-dashed border-[#e8ebef] bg-[#f8f9fb] px-4 py-6 text-center">
        <p className="m-0 text-sm leading-relaxed text-[#9AA4B2]">
          {emptyLabel ?? '-'}
        </p>
      </div>
    );
  }

  return (
    <pre className="m-0 max-h-[24rem] overflow-auto rounded-xl border border-[#e8ebef] bg-[#f8f9fb] p-4 text-xs leading-relaxed text-[#1A1A1A]">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

/**
 * Audit log detail - Users / employee profile chrome.
 */
export default function AuditLogDetailPageContent({
  auditLogId,
}: {
  auditLogId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const isNarrow = screens.sm === false;
  const detailQuery = useAuditLog(auditLogId);
  const log = detailQuery.data;

  useSetHeaderExtra(null);

  if (detailQuery.isLoading) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-employee-detail-page erp-audit-log-detail-page ${DETAIL_PAGE_V2}`}>
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !log) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-employee-detail-page ${DETAIL_PAGE_V2}`}>
        <ErpNotice
          tone="error"
          title={
            detailQuery.error instanceof ApiRequestError
              ? detailQuery.error.message
              : getFriendlyApiErrorMessage(
                  detailQuery.error,
                  t('auditLogs.notFound'),
                  t,
                )
          }
          action={
            <Button onClick={() => router.push(LIST_PATH)}>
              {t('auditLogs.backToList')}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className={`erp-pro-list-page erp-users-page erp-employee-detail-page erp-audit-log-detail-page ${DETAIL_PAGE_V2}`}>
      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-employee-toolbar">
          <div className="erp-employee-toolbar-back flex min-w-0 items-center gap-2">
            <Button
              type="text"
              icon={<ArrowLeft size={16} />}
              onClick={() => router.push(LIST_PATH)}
              aria-label={t('auditLogs.backToList')}
            >
              {isNarrow ? undefined : t('auditLogs.backToList')}
            </Button>
          </div>
        </div>

        <div className="erp-employee-hero erp-contract-hero">
          <div className="erp-employee-hero-copy min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span className="erp-users-id-chip">{log.module}</span>
              <StatusBadge
                label={log.action}
                variant={auditLogActionVariant(log.action)}
              />
              <StatusBadge
                label={formatAuditLogSourceLabel(log.source, t)}
                variant={auditLogSourceVariant(log.source)}
              />
            </div>
            <div className="flex min-w-0 flex-wrap items-baseline justify-center gap-2 sm:justify-start">
              <h2 className="erp-users-name erp-employee-hero-name m-0 break-words">
                {log.recordType}
              </h2>
            </div>
            <p className="erp-users-email m-0 mt-1.5 break-words sm:text-left">
              {formatAuditLogUserName(log)}
              {` · ${formatDisplayDateTime(log.createdAt)}`}
            </p>
          </div>
        </div>
      </div>

      <div className="erp-users-stat-bar erp-employee-meta-bar erp-contract-meta-bar">
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">
              {t('auditLogs.columns.timestamp')}
            </p>
            <p className="erp-employee-meta-value">
              {formatDisplayDateTime(log.createdAt)}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('auditLogs.columns.user')}</p>
            <p className="erp-employee-meta-value">
              {formatAuditLogUserName(log)}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">
              {t('auditLogs.columns.recordReference')}
            </p>
            <p className="erp-employee-meta-value">
              {log.recordReference?.trim() || '-'}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">
              {t('auditLogs.columns.source')}
            </p>
            <p className="erp-employee-meta-value">
              {formatAuditLogSourceLabel(log.source, t)}
            </p>
          </div>
        </div>
      </div>

      <div className="erp-pro-card">
        <DetailSection title={t('auditLogs.detail.overview')}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <MetaItem label={t('auditLogs.columns.user')}>
              <div>
                <p className="m-0 erp-users-cell-strong">
                  {formatAuditLogUserName(log)}
                </p>
                {log.user?.email ? (
                  <p className="m-0 mt-1 text-xs text-[#6B7280]">
                    {log.user.email}
                  </p>
                ) : null}
              </div>
            </MetaItem>
            <MetaItem label={t('auditLogs.columns.source')}>
              <StatusBadge
                label={formatAuditLogSourceLabel(log.source, t)}
                variant={auditLogSourceVariant(log.source)}
              />
            </MetaItem>
            <MetaItem label={t('auditLogs.columns.module')}>
              <span className="erp-users-id-chip">{log.module}</span>
            </MetaItem>
            <MetaItem label={t('auditLogs.columns.action')}>
              <StatusBadge
                label={log.action}
                variant={auditLogActionVariant(log.action)}
              />
            </MetaItem>
            <MetaItem label={t('auditLogs.columns.recordType')}>
              {log.recordType}
            </MetaItem>
            <MetaItem label={t('auditLogs.columns.recordId')}>
              <span className="break-all font-[family-name:var(--font-mono)] text-xs">
                {log.recordId}
              </span>
            </MetaItem>
            <MetaItem label={t('auditLogs.columns.recordReference')}>
              {log.recordReference ?? '-'}
            </MetaItem>
            <MetaItem label={t('auditLogs.columns.timestamp')}>
              {formatDisplayDateTime(log.createdAt)}
            </MetaItem>
          </div>
        </DetailSection>

        <DetailSection title={t('auditLogs.detail.technical')}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <MetaItem label={t('auditLogs.detail.ipAddress')}>
              {log.ipAddress ? (
                <span className="font-[family-name:var(--font-mono)] text-xs">
                  {log.ipAddress}
                </span>
              ) : (
                '-'
              )}
            </MetaItem>
            <MetaItem label={t('auditLogs.detail.deviceInfo')}>
              {log.deviceInfo ?? '-'}
            </MetaItem>
            <MetaItem label={t('auditLogs.detail.correlationId')}>
              {log.correlationId ? (
                <span className="break-all font-[family-name:var(--font-mono)] text-xs">
                  {log.correlationId}
                </span>
              ) : (
                '-'
              )}
            </MetaItem>
            <MetaItem label={t('auditLogs.detail.sessionId')}>
              {log.sessionId ? (
                <span className="break-all font-[family-name:var(--font-mono)] text-xs">
                  {log.sessionId}
                </span>
              ) : (
                '-'
              )}
            </MetaItem>
          </div>
        </DetailSection>

        <DetailSection title={t('auditLogs.detail.changes')}>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="min-w-0">
              <p className="mb-2 mt-0 text-xs font-semibold uppercase tracking-wide text-[#9AA4B2]">
                {t('auditLogs.detail.beforeValue')}
              </p>
              <JsonBlock
                value={log.beforeValue}
                emptyLabel={
                  log.action === 'create'
                    ? t('auditLogs.detail.noBeforeOnCreate')
                    : t('auditLogs.detail.noBeforeCaptured')
                }
              />
            </div>
            <div className="min-w-0">
              <p className="mb-2 mt-0 text-xs font-semibold uppercase tracking-wide text-[#9AA4B2]">
                {t('auditLogs.detail.afterValue')}
              </p>
              <JsonBlock
                value={log.afterValue}
                emptyLabel={
                  log.action === 'delete'
                    ? t('auditLogs.detail.noAfterOnDelete')
                    : undefined
                }
              />
            </div>
          </div>
        </DetailSection>
      </div>
    </div>
  );
}
