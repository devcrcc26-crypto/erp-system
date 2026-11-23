'use client';

import { useState } from 'react';
import Link from 'next/link';
import dayjs from 'dayjs';
import { Alert, Button, Input, InputNumber, Popconfirm, Tabs } from 'antd';
import {
  BankOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  FileTextOutlined,
  GiftOutlined,
  PlusOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import PayrollOtAdjustmentsSection from '@/components/modules/hr/payroll/PayrollOtAdjustmentsSection';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { PayrollEntryDetail, PayrollRunDetail } from '@/lib/api/payroll.types';
import { useUpdatePayrollEntry } from '@/lib/query/payroll';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import {
  formatPayrollMoney,
  parsePayrollMoney,
  payrollFlagLabelKey,
} from '@/lib/utils/payroll-display';
import {
  buildOtBreakdownLines,
  estimateNetIncrease,
} from '@/lib/utils/payroll-entry-detail';

const KEY = 'hr.payroll.entryPanel';

type TabKey = 'pay' | 'overtime' | 'bonus';

/**
 * Expanded payroll row: a summary strip (flag, department, discipline, bank,
 * links) and three tabs - pay details, overtime (system + manual) and
 * bonus / net top-ups, each editable in place where the run allows it.
 */
export default function PayrollEntryDetailPanel({
  row,
  run,
  canEdit,
  canChangeRun,
  onRemoveFreelancer,
}: {
  row: PayrollEntryDetail;
  run: PayrollRunDetail;
  /** Payroll edit permission. */
  canEdit: boolean;
  /** May add / remove entries on this run. */
  canChangeRun: boolean;
  onRemoveFreelancer: (row: PayrollEntryDetail) => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const [tab, setTab] = useState<TabKey>('pay');
  const runEditable = run.status === 'DRAFT' || run.status === 'REVIEWED';
  const canEditEntry = canEdit && runEditable;

  const otPay = parsePayrollMoney(row.totalOtPay);
  const topUps =
    parsePayrollMoney(row.bonusTopUp) +
    parsePayrollMoney(row.netTopUp) +
    parsePayrollMoney(row.contractNetBonus);

  return (
    <div className="erp-pe">
      <SummaryStrip row={row} run={run} />

      <Tabs
        size="small"
        activeKey={tab}
        onChange={(key) => setTab(key as TabKey)}
        className="erp-pe-tabs"
        items={[
          {
            key: 'pay',
            label: (
              <span className="erp-pe-tab-label">
                <FileTextOutlined aria-hidden />
                {t(`${KEY}.tabPay`)}
              </span>
            ),
            children: <PayDetails row={row} />,
          },
          {
            key: 'overtime',
            label: (
              <span className="erp-pe-tab-label">
                <ClockCircleOutlined aria-hidden />
                {t(`${KEY}.tabOvertime`)}
                {otPay > 0 ? (
                  <span className="erp-pe-tab-count">
                    {formatPayrollMoney(otPay, { emptyZero: false })}
                  </span>
                ) : null}
              </span>
            ),
            children: canEdit ? (
              <PayrollOtAdjustmentsSection
                runId={run.id}
                employeeId={row.employeeId}
                canEdit={canEdit}
              />
            ) : (
              <ReadOnlyOvertime row={row} />
            ),
          },
          {
            key: 'bonus',
            label: (
              <span className="erp-pe-tab-label">
                <GiftOutlined aria-hidden />
                {t(`${KEY}.tabBonus`)}
                {topUps > 0 ? (
                  <span className="erp-pe-tab-count">
                    {formatPayrollMoney(topUps, { emptyZero: false })}
                  </span>
                ) : null}
              </span>
            ),
            children: (
              <BonusTopUps row={row} run={run} canEdit={canEditEntry} />
            ),
          },
        ]}
      />

      {canChangeRun && row.employee.employeeType === 'FREELANCER' ? (
        <div className="erp-pe-footer">
          <Button danger size="small" onClick={() => onRemoveFreelancer(row)}>
            {t('hr.payroll.freelancers.remove')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ── Summary strip ─────────────────────────────────────────────────────────

function SummaryStrip({
  row,
  run,
}: {
  row: PayrollEntryDetail;
  run: PayrollRunDetail;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const bank = row.bankName
    ? `${row.bankName}${row.bankAccountNumber ? ` · ${row.bankAccountNumber}` : ''}`
    : null;
  const facts: Array<{ label: string; value: string | null; icon?: React.ReactNode }> = [
    { label: t('hr.payroll.entry.department'), value: row.employee.department?.name ?? null },
    {
      label: t('hr.payroll.entry.discipline'),
      value: row.employee.engineeringDiscipline?.name ?? null,
    },
    { label: t('hr.payroll.entry.bank'), value: bank, icon: <BankOutlined aria-hidden /> },
    {
      label: t('hr.payroll.entry.paidDays'),
      value: String(parsePayrollMoney(row.payrollDays)),
    },
  ];
  const links = [
    row.contractId
      ? { href: `/hr/employee-contract/${row.contractId}`, label: t('hr.payroll.entry.linkContract') }
      : null,
    row.attendanceRecordId
      ? {
          href: `/hr/attendance/review/${run.month}/${run.year}`,
          label: t('hr.payroll.entry.linkAttendance'),
        }
      : null,
    row.overtimeSheetId
      ? { href: `/hr/overtime/${row.overtimeSheetId}`, label: t('hr.payroll.entry.linkOvertime') }
      : null,
  ].filter((link): link is { href: string; label: string } => link != null);

  return (
    <div className="erp-pe-summary">
      {row.flag !== 'NONE' ? (
        <div className="erp-pe-flag" role="note">
          <WarningOutlined aria-hidden />
          <div className="min-w-0">
            <p className="erp-pe-flag-title">{t(payrollFlagLabelKey(row.flag))}</p>
            {row.flagNote ? <p className="erp-pe-flag-note">{row.flagNote}</p> : null}
          </div>
        </div>
      ) : null}
      <div className="erp-pe-summary-row">
        <dl className="erp-pe-facts">
          {facts.map((fact) => (
            <div key={fact.label} className="erp-pe-fact">
              <dt>{fact.label}</dt>
              <dd>
                {fact.icon}
                <span>{fact.value || '—'}</span>
              </dd>
            </div>
          ))}
        </dl>
        {links.length > 0 ? (
          <nav className="erp-pe-links" aria-label={t(`${KEY}.sources`)}>
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="erp-pe-link">
                {link.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
    </div>
  );
}

// ── Pay details ───────────────────────────────────────────────────────────

function PayDetails({ row }: { row: PayrollEntryDetail }): React.ReactNode {
  const { t } = useEpcTranslation();
  return (
    <div className="erp-pe-grid">
      <section className="erp-pe-card">
        <h4 className="erp-pe-card-title">{t('hr.payroll.entry.salaryPeriods')}</h4>
        {row.salaryPeriods.length === 0 ? (
          <p className="erp-pe-muted">{t(`${KEY}.singlePeriod`)}</p>
        ) : (
          <ul className="erp-pe-periods">
            {row.salaryPeriods.map((period) => {
              const periodOt = parsePayrollMoney(period.totalOtPay);
              return (
                <li key={period.id} className="erp-pe-period">
                  <div className="min-w-0">
                    <p className="erp-pe-period-dates">
                      {dayjs(period.periodStart).format('YYYY-MM-DD')} –{' '}
                      {dayjs(period.periodEnd).format('YYYY-MM-DD')}
                    </p>
                    <p className="erp-pe-muted">
                      {parsePayrollMoney(period.days)} {t('hr.payroll.entry.days')}
                      {' · '}
                      {t(`${KEY}.basic`, {
                        amount: formatPayrollMoney(period.basicSalary, { emptyZero: false }),
                      })}
                      {periodOt > 0
                        ? ` · OT ${formatPayrollMoney(period.totalOtPay, { emptyZero: false })}`
                        : null}
                    </p>
                  </div>
                  <span className="erp-pe-amount">
                    {formatPayrollMoney(period.earnedSalary, { emptyZero: false })} ETB
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="erp-pe-card">
        <h4 className="erp-pe-card-title">{t(`${KEY}.calculationNotes`)}</h4>
        {row.notes ? (
          <ul className="erp-pe-notes">
            {row.notes
              .split(/\.\s+/)
              .map((part) => part.trim().replace(/\.$/, ''))
              .filter(Boolean)
              .map((part) => (
                <li key={part}>{part}</li>
              ))}
          </ul>
        ) : (
          <p className="erp-pe-muted">{t(`${KEY}.noNotes`)}</p>
        )}
      </section>
    </div>
  );
}

// ── Overtime (no payroll edit permission: entry figures only) ────────────

function ReadOnlyOvertime({ row }: { row: PayrollEntryDetail }): React.ReactNode {
  const { t } = useEpcTranslation();
  const lines = buildOtBreakdownLines(row);
  const basic = formatPayrollMoney(row.basicSalary, { emptyZero: false });
  return (
    <section className="erp-pe-card">
      <h4 className="erp-pe-card-title">{t('hr.payroll.entry.otBreakdown')}</h4>
      {lines.length === 0 ? (
        <p className="erp-pe-muted">{t(`${KEY}.noOvertime`)}</p>
      ) : (
        <ul className="erp-payroll-ot-lines">
          {lines.map((line) => (
            <li key={line.key}>
              <span>{t(line.labelKey, { hours: line.hours, basic })}</span>
              <span>{formatPayrollMoney(line.pay, { emptyZero: false })} ETB</span>
            </li>
          ))}
          <li className="erp-payroll-ot-total">
            <span>{t('hr.payroll.entry.otTotal')}</span>
            <span>{formatPayrollMoney(row.totalOtPay, { emptyZero: false })} ETB</span>
          </li>
        </ul>
      )}
    </section>
  );
}

// ── Bonus / net top-ups ───────────────────────────────────────────────────

function BonusTopUps({
  row,
  run,
  canEdit,
}: {
  row: PayrollEntryDetail;
  run: PayrollRunDetail;
  canEdit: boolean;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const contractNetBonus = parsePayrollMoney(row.contractNetBonus);
  return (
    <div className="erp-pe-bonus">
      {!canEdit && (run.status !== 'DRAFT' && run.status !== 'REVIEWED') ? (
        <p className="erp-pe-muted">{t(`${KEY}.lockedRun`, { status: run.status })}</p>
      ) : null}
      <div className="erp-pe-grid erp-pe-grid--3">
        <TopUpCard
          row={row}
          kind="taxable"
          canEdit={canEdit}
        />
        <TopUpCard
          row={row}
          kind="net"
          canEdit={canEdit}
        />
        <section className="erp-pe-card erp-pe-topup">
          <header className="erp-pe-topup-head">
            <div>
              <h4 className="erp-pe-card-title">{t(`${KEY}.contractBonusTitle`)}</h4>
              <p className="erp-pe-muted">{t(`${KEY}.contractBonusDesc`)}</p>
            </div>
          </header>
          <p className="erp-pe-topup-amount">
            {contractNetBonus > 0
              ? `${formatPayrollMoney(contractNetBonus, { emptyZero: false })} ETB`
              : t(`${KEY}.notSet`)}
          </p>
        </section>
      </div>
    </div>
  );
}

function TopUpCard({
  row,
  kind,
  canEdit,
}: {
  row: PayrollEntryDetail;
  kind: 'taxable' | 'net';
  canEdit: boolean;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const update = useUpdatePayrollEntry(row.runId);
  const current =
    kind === 'taxable' ? parsePayrollMoney(row.bonusTopUp) : parsePayrollMoney(row.netTopUp);
  const currentReason =
    (kind === 'taxable' ? row.bonusTopUpReason : row.netTopUpReason)?.trim() ?? '';
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState<number | null>(current || null);
  const [reason, setReason] = useState(currentReason);

  const value = amount ?? 0;
  const reasonMissing = value > 0 && !reason.trim();
  // Preview the change from the current figure (current top-up is already in taxable income).
  const preview =
    kind === 'taxable'
      ? estimateNetIncrease(
          'taxable',
          value,
          parsePayrollMoney(row.taxableIncome) - current,
        ) - estimateNetIncrease('taxable', current, parsePayrollMoney(row.taxableIncome) - current)
      : value - current;

  function startEdit(): void {
    setAmount(current || null);
    setReason(currentReason);
    setEditing(true);
  }

  async function save(next: number, nextReason: string): Promise<void> {
    const payload =
      kind === 'taxable'
        ? { bonusTopUp: next, bonusTopUpReason: nextReason || undefined }
        : { netTopUp: next, netTopUpReason: nextReason || undefined };
    try {
      await update.mutateAsync({ entryId: row.id, payload });
      messageApi.success(
        next === 0 ? t(`${KEY}.topUpRemoved`) : t('hr.payroll.entry.bonusSaved'),
      );
      setEditing(false);
    } catch (error) {
      notifyApiError(error, t(`${KEY}.saveFailed`), messageApi, t);
    }
  }

  const title = kind === 'taxable' ? t(`${KEY}.taxableTitle`) : t(`${KEY}.netTitle`);
  const description = kind === 'taxable' ? t(`${KEY}.taxableDesc`) : t(`${KEY}.netDesc`);

  return (
    <section className={`erp-pe-card erp-pe-topup${editing ? ' is-editing' : ''}`}>
      <header className="erp-pe-topup-head">
        <div className="min-w-0">
          <h4 className="erp-pe-card-title">{title}</h4>
          <p className="erp-pe-muted">{description}</p>
        </div>
        {canEdit && !editing ? (
          <div className="erp-pe-actions">
            <Button
              size="small"
              icon={current > 0 ? <EditOutlined /> : <PlusOutlined />}
              onClick={startEdit}
            >
              {current > 0 ? t(`${KEY}.edit`) : t(`${KEY}.add`)}
            </Button>
            {current > 0 ? (
              <Popconfirm
                title={t(`${KEY}.removeConfirm`)}
                okText={t(`${KEY}.remove`)}
                cancelText={t('common.cancel')}
                okButtonProps={{ danger: true }}
                onConfirm={() => save(0, '')}
              >
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  aria-label={t(`${KEY}.remove`)}
                />
              </Popconfirm>
            ) : null}
          </div>
        ) : null}
      </header>

      {editing ? (
        <div className="erp-pe-form">
          <label className="erp-pe-field">
            <span>
              {kind === 'taxable'
                ? t('hr.payroll.entry.bonusTopUpAmount')
                : t('hr.payroll.entry.netTopUpAmount')}
            </span>
            <InputNumber
              autoFocus
              min={0}
              precision={2}
              value={amount}
              onChange={(next) => setAmount(typeof next === 'number' ? next : null)}
              className="w-full"
            />
          </label>
          <label className="erp-pe-field">
            <span>{t('hr.payroll.entry.bonusTopUpReason')}</span>
            <Input.TextArea
              rows={2}
              maxLength={500}
              value={reason}
              status={reasonMissing ? 'error' : undefined}
              onChange={(event) => setReason(event.target.value)}
            />
            {reasonMissing ? (
              <span className="erp-pe-error">{t('hr.payroll.entry.bonusReasonRequired')}</span>
            ) : null}
          </label>
          {value !== current ? (
            <Alert
              type="info"
              showIcon
              title={t(`${KEY}.netChange`, {
                amount: `${preview >= 0 ? '+' : '−'}${formatPayrollMoney(Math.abs(preview), {
                  emptyZero: false,
                })}`,
              })}
            />
          ) : null}
          <div className="erp-pe-form-actions">
            <Button size="small" onClick={() => setEditing(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              size="small"
              type="primary"
              loading={update.isPending}
              disabled={reasonMissing || (value === current && reason.trim() === currentReason)}
              onClick={() => void save(value, reason.trim())}
            >
              {t('common.save')}
            </Button>
          </div>
        </div>
      ) : current > 0 ? (
        <div>
          <p className="erp-pe-topup-amount">
            {formatPayrollMoney(current, { emptyZero: false })} ETB
          </p>
          {currentReason ? <p className="erp-pe-muted">{currentReason}</p> : null}
        </div>
      ) : (
        <p className="erp-pe-topup-amount erp-pe-topup-amount--empty">{t(`${KEY}.notSet`)}</p>
      )}
    </section>
  );
}
