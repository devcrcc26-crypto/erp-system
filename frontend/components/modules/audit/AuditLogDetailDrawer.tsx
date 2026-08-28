'use client';

import { Descriptions, Drawer } from 'antd';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type { AuditLog } from '@/lib/api/types';
import { layout, wideDetailDrawerProps } from '@/lib/theme/layout';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { formatDisplayDateTime } from '@/lib/utils/date-format';
import {
  auditLogActionVariant,
  auditLogSourceVariant,
  formatAuditLogSourceLabel,
  formatAuditLogUserName,
} from '@/lib/utils/audit-log-display';

function JsonBlock({
  value,
  emptyLabel,
}: {
  value: unknown;
  emptyLabel?: string;
}): React.ReactNode {
  if (value === null || value === undefined) {
    return (
      <span style={{ color: 'var(--color-text-tertiary)' }}>
        {emptyLabel ?? '—'}
      </span>
    );
  }

  return (
    <pre className="erp-drawer-code-block">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function AuditLogDetailDrawer({
  log,
  open,
  onClose,
}: {
  log: AuditLog | null;
  open: boolean;
  onClose: () => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();

  return (
    <Drawer
      {...wideDetailDrawerProps}
      title={t('auditLogs.detailTitle')}
      open={open}
      onClose={onClose}
    >
      {log ? (
        <div className={layout.drawerStack}>
          <Descriptions
            className={layout.drawerDescriptionsClass}
            column={1}
            size="small"
            bordered
          >
            <Descriptions.Item label={t('auditLogs.columns.timestamp')}>
              {formatDisplayDateTime(log.createdAt)}
            </Descriptions.Item>
            <Descriptions.Item label={t('auditLogs.columns.user')}>
              {formatAuditLogUserName(log)}
              {log.user?.email ? (
                <span
                  className={`block ${layout.drawerMetaLabel} normal-case tracking-normal`}
                >
                  {log.user.email}
                </span>
              ) : null}
            </Descriptions.Item>
            <Descriptions.Item label={t('auditLogs.columns.source')}>
              <StatusBadge
                label={formatAuditLogSourceLabel(log.source, t)}
                variant={auditLogSourceVariant(log.source)}
              />
            </Descriptions.Item>
            <Descriptions.Item label={t('auditLogs.columns.module')}>
              {log.module}
            </Descriptions.Item>
            <Descriptions.Item label={t('auditLogs.columns.action')}>
              <StatusBadge
                label={log.action}
                variant={auditLogActionVariant(log.action)}
              />
            </Descriptions.Item>
            <Descriptions.Item label={t('auditLogs.columns.recordType')}>
              {log.recordType}
            </Descriptions.Item>
            <Descriptions.Item label={t('auditLogs.columns.recordId')}>
              <span className="break-all font-mono text-xs">{log.recordId}</span>
            </Descriptions.Item>
            <Descriptions.Item label={t('auditLogs.columns.recordReference')}>
              {log.recordReference ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label={t('auditLogs.detail.ipAddress')}>
              {log.ipAddress ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label={t('auditLogs.detail.deviceInfo')}>
              {log.deviceInfo ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label={t('auditLogs.detail.correlationId')}>
              {log.correlationId ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label={t('auditLogs.detail.sessionId')}>
              {log.sessionId ?? '—'}
            </Descriptions.Item>
          </Descriptions>

          <section className={layout.drawerSection}>
            <h3 className={`${layout.drawerHeading} mb-2`}>
              {t('auditLogs.detail.beforeValue')}
            </h3>
            <JsonBlock
              value={log.beforeValue}
              emptyLabel={
                log.action === 'create'
                  ? t('auditLogs.detail.noBeforeOnCreate')
                  : t('auditLogs.detail.noBeforeCaptured')
              }
            />
          </section>

          <section className={layout.drawerSection}>
            <h3 className={`${layout.drawerHeading} mb-2`}>
              {t('auditLogs.detail.afterValue')}
            </h3>
            <JsonBlock
              value={log.afterValue}
              emptyLabel={
                log.action === 'delete'
                  ? t('auditLogs.detail.noAfterOnDelete')
                  : undefined
              }
            />
          </section>
        </div>
      ) : null}
    </Drawer>
  );
}
