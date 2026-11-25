'use client';

import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Button, Empty, Input, InputNumber, Segmented, Select, Spin, Tag, Timeline } from 'antd';
import { EditOutlined, HistoryOutlined } from '@ant-design/icons';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { PayrollEntryDetail, PayrollSalaryPeriod } from '@/lib/api/payroll.types';
import { usePayrollEntryAudit, useUpdatePayrollEntryDays } from '@/lib/query/payroll';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatPayrollMoney, parsePayrollMoney } from '@/lib/utils/payroll-display';
import { formatUserName } from '@/lib/utils/user-display';
import { useReportDirty } from '@/components/modules/hr/payroll/payroll-entry-dirty';

const KEY = 'hr.payroll.entry.daysOverride';

function periodLabel(period: PayrollSalaryPeriod): string {
  const number =
    period.contract?.contractNumber?.trim() || period.contractId.slice(0, 8);
  const start = dayjs(period.periodStart).format('D MMM');
  const end = dayjs(period.periodEnd).format('D MMM');
  return `${number} · ${start}–${end}`;
}

function sortPeriods(periods: readonly PayrollSalaryPeriod[]): PayrollSalaryPeriod[] {
  return [...periods].sort(
    (a, b) => dayjs(a.periodStart).valueOf() - dayjs(b.periodStart).valueOf(),
  );
}

/**
 * Paid days tab of the payroll entry drawer: the day counts, the HR override
 * form (DRAFT / REVIEWED runs) and the full override history.
 *
 * Multi-contract months use a contract-period picker (same pattern as OT) so
 * each period's paid days can be edited independently; the entry total is the sum.
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
  const periods = useMemo(() => sortPeriods(entry.salaryPeriods), [entry.salaryPeriods]);
  const multiPeriod = periods.length > 1;
  const currentTotal = parsePayrollMoney(entry.payrollDays);

  const [periodId, setPeriodId] = useState<string | null>(null);
  useEffect(() => {
    if (!multiPeriod) {
      setPeriodId(null);
      return;
    }
    setPeriodId((current) =>
      current && periods.some((period) => period.id === current)
        ? current
        : periods[periods.length - 1]!.id,
    );
  }, [multiPeriod, periods]);

  const selectedPeriod = multiPeriod
    ? (periods.find((period) => period.id === periodId) ?? periods[periods.length - 1]!)
    : null;
  const currentDays = selectedPeriod
    ? parsePayrollMoney(selectedPeriod.days)
    : currentTotal;

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

  function selectPeriod(nextId: string): void {
    if (nextId === periodId) return;
    if (editing && (days !== currentDays || reason.trim() !== '')) {
      messageApi.warning(t(`${KEY}.unsavedPeriod`));
      return;
    }
    setPeriodId(nextId);
    const next = periods.find((period) => period.id === nextId);
    const nextDays = next ? parsePayrollMoney(next.days) : currentTotal;
    setDays(nextDays);
    setReason('');
  }

  async function save(): Promise<void> {
    if (days == null) {
      return;
    }
    try {
      await updateDays.mutateAsync({
        payrollDays: days,
        ...(selectedPeriod ? { periodId: selectedPeriod.id } : {}),
        reason: reason.trim() || undefined,
      });
      messageApi.success(t(`${KEY}.saved`));
      setEditing(false);
    } catch (error) {
      notifyApiError(error, t(`${KEY}.action`), messageApi, t);
    }
  }

  const otherPeriodsTotal = selectedPeriod
    ? periods
        .filter((period) => period.id !== selectedPeriod.id)
        .reduce((sum, period) => sum + parsePayrollMoney(period.days), 0)
    : 0;
  const previewTotal =
    selectedPeriod && days != null ? otherPeriodsTotal + days : currentTotal;

  const facts = [
    { label: t('hr.payroll.entryDrawer.employedDays'), value: parsePayrollMoney(entry.employedDays) },
    { label: t('hr.payroll.entryDrawer.absentDays'), value: parsePayrollMoney(entry.absentDays) },
    {
      label: t('hr.payroll.entry.paidDays'),
      value: editing && selectedPeriod && days != null ? previewTotal : currentTotal,
      strong: true,
    },
  ];

  const pickerOptions = periods.map((period) => ({
    label: periodLabel(period),
    value: period.id,
  }));

  return (
    <div className="erp-pe-days">
      <section className="erp-pe-card">
        <header className="erp-pe-card-head">
          <div className="min-w-0">
            <h4 className="erp-pe-card-title">
              {t('hr.payroll.entry.paidDays')}
              {entry.hasOverride ? (
                <Tag color="orange" className="erp-pe-inline-tag">
                  {t(`${KEY}.edited`)}
                </Tag>
              ) : null}
            </h4>
            <p className="erp-pe-muted">
              {multiPeriod ? t(`${KEY}.multiPeriodHint`) : t('hr.payroll.entry.paidDaysBasis')}
            </p>
          </div>
          {canOverride && !editing ? (
            <Button size="small" icon={<EditOutlined />} onClick={startEditing}>
              {t('hr.payroll.entryDrawer.changeDays')}
            </Button>
          ) : null}
        </header>

        {multiPeriod && selectedPeriod ? (
          <div className="erp-pe-days-contract">
            <span className="erp-pe-days-contract-label">{t(`${KEY}.periodLabel`)}</span>
            {periods.length <= 3 ? (
              <Segmented
                size="small"
                value={selectedPeriod.id}
                options={pickerOptions}
                onChange={(value) => selectPeriod(String(value))}
              />
            ) : (
              <Select
                size="small"
                className="erp-pe-days-contract-select"
                value={selectedPeriod.id}
                options={pickerOptions}
                onChange={selectPeriod}
              />
            )}
            <p className="erp-pe-days-contract-hint">
              {t(`${KEY}.periodPaid`, {
                days: parsePayrollMoney(selectedPeriod.days),
                basic: formatPayrollMoney(selectedPeriod.basicSalary, { emptyZero: false }),
              })}
            </p>
          </div>
        ) : null}

        <dl className="erp-pe-daycounts">
          {facts.map((fact) => (
            <div key={fact.label} className={fact.strong ? 'is-strong' : undefined}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>

        {multiPeriod ? (
          <ul className="erp-pe-days-periods" aria-label={t('hr.payroll.entry.salaryPeriods')}>
            {periods.map((period) => {
              const paid = parsePayrollMoney(period.days);
              const isActive = selectedPeriod?.id === period.id;
              return (
                <li
                  key={period.id}
                  className={`erp-pe-days-period${isActive ? ' is-active' : ''}`}
                >
                  <div className="min-w-0">
                    <p className="erp-pe-days-period-title">{periodLabel(period)}</p>
                    <p className="erp-pe-muted">
                      {t(`${KEY}.periodEarned`, {
                        amount: formatPayrollMoney(period.earnedSalary, { emptyZero: false }),
                      })}
                    </p>
                  </div>
                  <span className="erp-pe-days-period-days">
                    {paid} {t('hr.payroll.entry.days')}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}

        {editing ? (
          <div className="erp-pe-form erp-pe-form--boxed">
            <label className="erp-pe-field">
              <span>
                {selectedPeriod
                  ? t(`${KEY}.periodDaysLabel`, { period: periodLabel(selectedPeriod) })
                  : t(`${KEY}.daysLabel`)}
              </span>
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
            {selectedPeriod && days != null && days !== currentDays ? (
              <p className="erp-pe-muted">
                {t(`${KEY}.totalPreview`, { total: previewTotal })}
              </p>
            ) : null}
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
