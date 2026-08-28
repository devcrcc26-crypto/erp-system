'use client';

import { Alert, Button, Skeleton } from 'antd';
import { ArrowLeft, ScrollText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import { useAuditLog } from '@/lib/query/audit-logs';
import { tokens } from '@/lib/theme/tokens';
import {
  auditLogActionVariant,
  auditLogSourceVariant,
  formatAuditLogSourceLabel,
  formatAuditLogUserName,
} from '@/lib/utils/audit-log-display';
import { formatDisplayDateTime } from '@/lib/utils/date-format';

function JsonBlock({
  value,
  emptyLabel,
}: {
  value: unknown;
  emptyLabel?: string;
}): React.ReactNode {
  if (value === null || value === undefined) {
    return (
      <div className="rounded-none border border-dashed border-[rgba(0,0,0,0.12)] bg-[#F8F7F4] px-4 py-6 text-center">
        <p
          className="m-0 text-sm leading-relaxed"
          style={{ color: tokens.colorTextTertiary }}
        >
          {emptyLabel ?? '—'}
        </p>
      </div>
    );
  }

  return (
    <pre className="m-0 max-h-[24rem] overflow-auto rounded-none border border-[rgba(0,0,0,0.08)] bg-[#F8F7F4] p-4 text-xs leading-relaxed">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function AuditLogDetailPageContent({
  auditLogId,
}: {
  auditLogId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const detailQuery = useAuditLog(auditLogId);
  const log = detailQuery.data;

  if (detailQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !log) {
    return (
      <div className="flex flex-col gap-4">
        <Alert
          type="error"
          showIcon
          title={
            detailQuery.error instanceof ApiRequestError
              ? detailQuery.error.message
              : t('auditLogs.notFound')
          }
          action={
            <Button
              onClick={() => router.push('/audit-logs')}
              style={{ borderRadius: 0 }}
            >
              {t('auditLogs.backToList')}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="text"
          icon={<ArrowLeft size={16} />}
          onClick={() => router.push('/audit-logs')}
          style={{ borderRadius: 0 }}
        >
          {t('auditLogs.backToList')}
        </Button>
      </div>

      <div
        className="overflow-hidden rounded-none"
        style={{
          background: tokens.colorCardBg,
          border: `1px solid ${tokens.colorBorder}`,
        }}
      >
        <div className="px-3 py-4 sm:px-5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <ScrollText size={16} style={{ color: tokens.colorPrimary }} />
            <span
              className="text-sm font-semibold"
              style={{ color: tokens.colorTextPrimary }}
            >
              {log.module}
            </span>
            <StatusBadge
              label={log.action}
              variant={auditLogActionVariant(log.action)}
            />
            <StatusBadge
              label={formatAuditLogSourceLabel(log.source, t)}
              variant={auditLogSourceVariant(log.source)}
            />
          </div>
          <p
            className="m-0 text-xs"
            style={{ color: tokens.colorTextTertiary }}
          >
            {formatDisplayDateTime(log.createdAt)}
          </p>
        </div>
      </div>

      <SummaryStrip
        items={[
          {
            label: t('auditLogs.columns.timestamp'),
            value: formatDisplayDateTime(log.createdAt),
            emphasize: true,
          },
          {
            label: t('auditLogs.columns.user'),
            value: formatAuditLogUserName(log),
          },
          {
            label: t('auditLogs.columns.recordType'),
            value: log.recordType,
          },
          {
            label: t('auditLogs.columns.recordReference'),
            value: log.recordReference?.trim() || '—',
          },
        ]}
      />

      <SectionCard title={t('auditLogs.detail.overview')}>
        <div className="grid grid-cols-1 gap-4 p-3 sm:grid-cols-2 sm:p-5">
          <MetaItem label={t('auditLogs.columns.user')}>
            <div>
              <p className="m-0">{formatAuditLogUserName(log)}</p>
              {log.user?.email ? (
                <p
                  className="m-0 mt-1 text-xs"
                  style={{ color: tokens.colorTextTertiary }}
                >
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
          <MetaItem label={t('auditLogs.columns.module')}>{log.module}</MetaItem>
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
            {log.recordReference ?? '—'}
          </MetaItem>
        </div>
      </SectionCard>

      <SectionCard title={t('auditLogs.detail.technical')}>
        <div className="grid grid-cols-1 gap-4 p-3 sm:grid-cols-2 sm:p-5">
          <MetaItem label={t('auditLogs.detail.ipAddress')}>
            {log.ipAddress ? (
              <span className="font-[family-name:var(--font-mono)] text-xs">
                {log.ipAddress}
              </span>
            ) : (
              '—'
            )}
          </MetaItem>
          <MetaItem label={t('auditLogs.detail.deviceInfo')}>
            {log.deviceInfo ?? '—'}
          </MetaItem>
          <MetaItem label={t('auditLogs.detail.correlationId')}>
            {log.correlationId ? (
              <span className="break-all font-[family-name:var(--font-mono)] text-xs">
                {log.correlationId}
              </span>
            ) : (
              '—'
            )}
          </MetaItem>
          <MetaItem label={t('auditLogs.detail.sessionId')}>
            {log.sessionId ? (
              <span className="break-all font-[family-name:var(--font-mono)] text-xs">
                {log.sessionId}
              </span>
            ) : (
              '—'
            )}
          </MetaItem>
        </div>
      </SectionCard>

      <SectionCard title={t('auditLogs.detail.changes')}>
        <div className="grid grid-cols-1 gap-4 p-3 lg:grid-cols-2 sm:p-5">
          <div className="min-w-0">
            <p className="mb-2 mt-0 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
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
            <p className="mb-2 mt-0 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
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
      </SectionCard>
    </div>
  );
}
