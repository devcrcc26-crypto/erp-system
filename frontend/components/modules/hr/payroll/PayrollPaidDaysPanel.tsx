'use client';

import { useState } from 'react';
import dayjs from 'dayjs';
import { Button, Empty, Input, InputNumber, Spin, Tag, Timeline } from 'antd';
import { EditOutlined, HistoryOutlined } from '@ant-design/icons';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { PayrollEntryDetail } from '@/lib/api/payroll.types';
import { usePayrollEntryAudit, useUpdatePayrollEntryDays } from '@/lib/query/payroll';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { parsePayrollMoney } from '@/lib/utils/payroll-display';
import { formatUserName } from '@/lib/utils/user-display';
import { useReportDirty } from '@/components/modules/hr/payroll/payroll-entry-dirty';

const KEY = 'hr.payroll.entry.daysOverride';

/**
 * Paid days tab of the payroll entry drawer: the day counts, the HR override
 * form (DRAFT / REVIEWED runs) and the full override history.
 */
export default function PayrollPaidDaysPanel({
  runId,
  entry,
  canOverride,
}: {
  runId: string;
  entry: PayrollEntryDetail;
  /** False once the run has left DRAFT / REVIEWED; history stays available. */
  canOverride: boolean;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const currentDays = parsePayrollMoney(entry.payrollDays);
  const [editing, setEditing] = useState(false);
  const [days, setDays] = useState<number | null>(currentDays);
  const [reason, setReason] = useState('');
  const updateDays = useUpdatePayrollEntryDays(runId, entry.id);
  const auditQuery = usePayrollEntryAudit(runId, entry.id);
  const records = auditQuery.data ?? [];

  useReportDirty('paid-days', editing && (days !== currentDays || reason.trim() !== ''));

  function startEditing(): void {
    setDays(currentDays);
    setReason('');
    setEditing(true);
  }

  async function save(): Promise<void> {
    if (days == null) {
      return;
    }
    try {
      await updateDays.mutateAsync({
        payrollDays: days,
        reason: reason.trim() || undefined,
      });
      messageApi.success(t(`${KEY}.saved`));
      setEditing(false);
    } catch (error) {
      notifyApiError(error, t(`${KEY}.action`), messageApi, t);
    }
  }

  const facts = [
    { label: t('hr.payroll.entryDrawer.employedDays'), value: parsePayrollMoney(entry.employedDays) },
    { label: t('hr.payroll.entryDrawer.absentDays'), value: parsePayrollMoney(entry.absentDays) },
    { label: t('hr.payroll.entry.paidDays'), value: currentDays, strong: true },
  ];

  return (
    <div className="erp-pe-days">
      <section className="erp-pe-card">
        <header className="erp-pe-topup-head">
          <div className="min-w-0">
            <h4 className="erp-pe-card-title">
              {t('hr.payroll.entry.paidDays')}
              {entry.hasOverride ? (
                <Tag color="orange" className="erp-pe-inline-tag">
                  {t(`${KEY}.edited`)}
                </Tag>
              ) : null}
            </h4>
            <p className="erp-pe-muted">{t('hr.payroll.entry.paidDaysBasis')}</p>
          </div>
          {canOverride && !editing ? (
            <Button size="small" icon={<EditOutlined />} onClick={startEditing}>
              {t('hr.payroll.entryDrawer.changeDays')}
            </Button>
          ) : null}
        </header>

        <dl className="erp-pe-daycounts">
          {facts.map((fact) => (
            <div key={fact.label} className={fact.strong ? 'is-strong' : undefined}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>

        {editing ? (
          <div className="erp-pe-form erp-pe-form--boxed">
            <label className="erp-pe-field">
              <span>{t(`${KEY}.daysLabel`)}</span>
              <InputNumber
                autoFocus
                min={0}
                max={30}
                step={0.5}
                precision={2}
                className="w-full"
                value={days}
                onChange={(value) => setDays(typeof value === 'number' ? value : null)}
              />
            </label>
            <label className="erp-pe-field">
              <span>{t('hr.payroll.entryDrawer.reason')}</span>
              <Input.TextArea
                placeholder={t(`${KEY}.reasonPlaceholder`)}
                rows={2}
                maxLength={1000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <p className="erp-pe-muted">{t('hr.payroll.entryDrawer.daysRecalcHint')}</p>
            <div className="erp-pe-form-actions">
              <Button size="small" onClick={() => setEditing(false)}>
                {t(`${KEY}.cancel`)}
              </Button>
              <Button
                size="small"
                type="primary"
                loading={updateDays.isPending}
                disabled={days == null || days === currentDays}
                onClick={() => void save()}
              >
                {t(`${KEY}.save`)}
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="erp-pe-card">
        <h4 className="erp-pe-card-title">
          <HistoryOutlined aria-hidden /> {t(`${KEY}.historyTitle`)}
        </h4>
        {auditQuery.isLoading ? (
          <div className="py-6 text-center">
            <Spin size="small" />
          </div>
        ) : records.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t(`${KEY}.historyEmpty`)}
          />
        ) : (
          <Timeline
            className="erp-pe-timeline"
            items={records.map((record) => ({
              key: record.id,
              content: (
                <div>
                  <p className="erp-pe-timeline-title">
                    {t(`${KEY}.historyChange`, {
                      from: record.oldValue,
                      to: record.newValue,
                    })}
                  </p>
                  {record.reason ? (
                    <p className="erp-pe-timeline-text">
                      {t(`${KEY}.historyReason`, { reason: record.reason })}
                    </p>
                  ) : null}
                  <p className="erp-pe-muted">
                    {formatUserName(record.changedBy)} ·{' '}
                    {dayjs(record.changedAt).format('D MMM YYYY, HH:mm')}
                  </p>
                </div>
              ),
            }))}
          />
        )}
      </section>
    </div>
  );
}
