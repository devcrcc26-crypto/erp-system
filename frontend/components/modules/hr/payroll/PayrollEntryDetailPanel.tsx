'use client';

import { useState } from 'react';
import Link from 'next/link';
import dayjs from 'dayjs';
import { Button, Collapse, Input, InputNumber, Tabs } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import PayrollOtAdjustmentsSection from '@/components/modules/hr/payroll/PayrollOtAdjustmentsSection';
import PayrollPaidDaysPanel from '@/components/modules/hr/payroll/PayrollPaidDaysPanel';
import { useReportDirty } from '@/components/modules/hr/payroll/payroll-entry-dirty';
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
import { buildOtBreakdownLines } from '@/lib/utils/payroll-entry-detail';
import { entryWithTopUp, round2 } from '@/lib/utils/payroll-live';

const KEY = 'hr.payroll.entryPanel';

export type PayrollEntryTab = 'pay' | 'days' | 'overtime' | 'bonus';

function money(value: number | string | null | undefined): string {
  return formatPayrollMoney(value ?? 0, { emptyZero: false });
}

/**
 * Body of the payroll entry drawer, in four tabs: the pay statement (with
 * employee details folded away), paid days, overtime and top-ups. Overtime and
 * top-ups are spreadsheet-style grids that recalculate as you type.
 */
export default function PayrollEntryDetailPanel({
  row,
  run,
  canEdit,
  canChangeRun,
  canOverrideDays,
  tab,
  onTabChange,
  onRemoveFreelancer,
}: {
  row: PayrollEntryDetail;
  run: PayrollRunDetail;
  /** Payroll edit permission. */
  canEdit: boolean;
  /** May add / remove entries on this run. */
  canChangeRun: boolean;
  /** May override paid days now (edit permission and an editable run). */
  canOverrideDays: boolean;
  tab: PayrollEntryTab;
  onTabChange: (tab: PayrollEntryTab) => void;
  onRemoveFreelancer: (row: PayrollEntryDetail) => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const runEditable = run.status === 'DRAFT' || run.status === 'REVIEWED';

  return (
    <div className="erp-pe">
      <Tabs
        size="small"
        activeKey={tab}
        onChange={(key) => onTabChange(key as PayrollEntryTab)}
        className="erp-pe-tabs"
        items={[
          {
            key: 'pay',
            label: t(`${KEY}.tabPay`),
            children: <PayStatement row={row} run={run} />,
          },
          {
            key: 'days',
            label: t(`${KEY}.tabDays`),
            children: (
              <PayrollPaidDaysPanel runId={run.id} entry={row} canOverride={canOverrideDays} />
            ),
          },
          {
            key: 'overtime',
            label: t(`${KEY}.tabOvertime`),
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
            label: t(`${KEY}.tabBonus`),
            children: <TopUpGrid row={row} canEdit={canEdit && runEditable} />,
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

// ── Pay statement ─────────────────────────────────────────────────────────

function PayStatement({
  row,
  run,
}: {
  row: PayrollEntryDetail;
  run: PayrollRunDetail;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const transport =
    parsePayrollMoney(row.taxableTransport) + parsePayrollMoney(row.nonTaxableTransport);
  const bonus = parsePayrollMoney(row.monthlyBonus) + parsePayrollMoney(row.bonusTopUp);
  const netBonus = parsePayrollMoney(row.contractNetBonus) + parsePayrollMoney(row.netTopUp);
  const lines: Array<{
    key: string;
    label: string;
    sub?: string;
    value: number;
    kind?: 'deduct' | 'add' | 'total' | 'net';
  }> = [
    {
      key: 'earned',
      label: t(`${KEY}.earned`),
      sub: t(`${KEY}.earnedSub`, {
        basic: money(row.basicSalary),
        days: parsePayrollMoney(row.payrollDays),
      }),
      value: parsePayrollMoney(row.earnedSalary),
    },
    { key: 'ot', label: t('hr.payroll.entry.otPay'), value: parsePayrollMoney(row.totalOtPay) },
    { key: 'transport', label: t('hr.payroll.entry.transport'), value: transport },
    { key: 'bonus', label: t('hr.payroll.entry.bonus'), value: bonus },
    {
      key: 'gross',
      label: t('hr.payroll.entry.gross'),
      value: parsePayrollMoney(row.grossIncome),
      kind: 'total',
    },
    {
      key: 'pension',
      label: t('hr.payroll.entry.pensionEmp'),
      value: parsePayrollMoney(row.pensionEmployee),
      kind: 'deduct',
    },
    {
      key: 'pensionEmr',
      label: t('hr.payroll.entry.pensionEmr'),
      value: parsePayrollMoney(row.pensionEmployer),
    },
    {
      key: 'tax',
      label: t('hr.payroll.entry.tax'),
      sub: t(`${KEY}.taxableSub`, { amount: money(row.taxableIncome) }),
      value: parsePayrollMoney(row.incomeTax),
      kind: 'deduct',
    },
    ...(netBonus > 0
      ? [{ key: 'netBonus', label: t('hr.payroll.entry.netBonus'), value: netBonus, kind: 'add' as const }]
      : []),
    { key: 'net', label: t('hr.payroll.entry.net'), value: parsePayrollMoney(row.netPay), kind: 'net' },
  ];

  const bank = row.bankName
    ? `${row.bankName}${row.bankAccountNumber ? ` · ${row.bankAccountNumber}` : ''}`
    : '—';
  const links = [
    row.contractId
      ? { href: `/hr/employee-contract/${row.contractId}`, label: t('hr.payroll.entry.linkContract') }
      : null,
    row.attendanceRecordId
      ? { href: `/hr/attendance/review/${run.month}/${run.year}`, label: t('hr.payroll.entry.linkAttendance') }
      : null,
    row.overtimeSheetId
      ? { href: `/hr/overtime/${row.overtimeSheetId}`, label: t('hr.payroll.entry.linkOvertime') }
      : null,
  ].filter((link): link is { href: string; label: string } => link != null);

  const sections = [
    ...(row.salaryPeriods.length > 0
      ? [
          {
            key: 'periods',
            label: t('hr.payroll.entry.salaryPeriods'),
            children: (
              <ul className="erp-pe-periods">
                {row.salaryPeriods.map((period) => (
                  <li key={period.id} className="erp-pe-period">
                    <div className="min-w-0">
                      <p className="erp-pe-period-dates">
                        {dayjs(period.periodStart).format('YYYY-MM-DD')} –{' '}
                        {dayjs(period.periodEnd).format('YYYY-MM-DD')}
                      </p>
                      <p className="erp-pe-muted">
                        {parsePayrollMoney(period.days)} {t('hr.payroll.entry.days')} ·{' '}
                        {t(`${KEY}.basic`, { amount: money(period.basicSalary) })}
                      </p>
                    </div>
                    <span className="erp-pe-amount">{money(period.earnedSalary)}</span>
                  </li>
                ))}
              </ul>
            ),
          },
        ]
      : []),
    {
      key: 'employee',
      label: t(`${KEY}.employeeDetails`),
      children: (
        <div>
          <dl className="erp-pe-kv">
            <div>
              <dt>{t('hr.payroll.entry.department')}</dt>
              <dd>{row.employee.department?.name ?? '—'}</dd>
            </div>
            <div>
              <dt>{t('hr.payroll.entry.discipline')}</dt>
              <dd>{row.employee.engineeringDiscipline?.name ?? '—'}</dd>
            </div>
            <div>
              <dt>{t('hr.payroll.entry.bank')}</dt>
              <dd>{bank}</dd>
            </div>
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
      ),
    },
    {
      key: 'notes',
      label: t(`${KEY}.calculationNotes`),
      children: row.notes ? (
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
      ),
    },
  ];

  return (
    <div className="erp-pe-pay">
      {row.flag !== 'NONE' ? (
        <div className="erp-pe-flag" role="note">
          <WarningOutlined aria-hidden />
          <div className="min-w-0">
            <p className="erp-pe-flag-title">{t(payrollFlagLabelKey(row.flag))}</p>
            {row.flagNote ? <p className="erp-pe-flag-note">{row.flagNote}</p> : null}
          </div>
        </div>
      ) : null}

      <dl className="erp-pe-statement">
        {lines.map((line) => (
          <div key={line.key} className={line.kind ? `is-${line.kind}` : undefined}>
            <dt>
              {line.label}
              {line.sub ? <small>{line.sub}</small> : null}
            </dt>
            <dd>
              {line.kind === 'deduct' ? '− ' : line.kind === 'add' ? '+ ' : ''}
              {money(line.value)}
            </dd>
          </div>
        ))}
      </dl>

      <Collapse
        ghost
        size="small"
        className="erp-pe-more"
        items={sections}
        defaultActiveKey={[]}
      />
    </div>
  );
}

// ── Overtime (no payroll edit permission: entry figures only) ────────────

function ReadOnlyOvertime({ row }: { row: PayrollEntryDetail }): React.ReactNode {
  const { t } = useEpcTranslation();
  const lines = buildOtBreakdownLines(row);
  const basic = money(row.basicSalary);
  if (lines.length === 0) {
    return <p className="erp-pe-muted">{t(`${KEY}.noOvertime`)}</p>;
  }
  return (
    <dl className="erp-pe-statement">
      {lines.map((line) => (
        <div key={line.key}>
          <dt>{t(line.labelKey, { hours: line.hours, basic })}</dt>
          <dd>{money(line.pay)}</dd>
        </div>
      ))}
      <div className="is-total">
        <dt>{t('hr.payroll.entry.otTotal')}</dt>
        <dd>{money(row.totalOtPay)}</dd>
      </div>
    </dl>
  );
}

// ── Top-ups grid ──────────────────────────────────────────────────────────

interface TopUpDraft {
  amount: number | null;
  reason: string;
}

function TopUpGrid({
  row,
  canEdit,
}: {
  row: PayrollEntryDetail;
  canEdit: boolean;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const update = useUpdatePayrollEntry(row.runId);

  const savedTaxable: TopUpDraft = {
    amount: parsePayrollMoney(row.bonusTopUp) || null,
    reason: row.bonusTopUpReason?.trim() ?? '',
  };
  const savedNet: TopUpDraft = {
    amount: parsePayrollMoney(row.netTopUp) || null,
    reason: row.netTopUpReason?.trim() ?? '',
  };
  const [taxable, setTaxable] = useState<TopUpDraft>(savedTaxable);
  const [net, setNet] = useState<TopUpDraft>(savedNet);

  const same = (a: TopUpDraft, b: TopUpDraft): boolean =>
    (a.amount ?? 0) === (b.amount ?? 0) && a.reason.trim() === b.reason.trim();
  const taxableChanged = !same(taxable, savedTaxable);
  const netChanged = !same(net, savedNet);
  const changed = taxableChanged || netChanged;
  const missingReason =
    ((taxable.amount ?? 0) > 0 && !taxable.reason.trim()) ||
    ((net.amount ?? 0) > 0 && !net.reason.trim());
  useReportDirty('top-ups', changed);

  // Live effect on net pay (estimated tax for the taxable top-up).
  const baseNet = parsePayrollMoney(row.netPay);
  const afterTaxable = entryWithTopUp(row, 'taxable', taxable.amount ?? 0, null);
  const taxableEffect = round2(parsePayrollMoney(afterTaxable.netPay) - baseNet);
  const netEffect = round2((net.amount ?? 0) - parsePayrollMoney(row.netTopUp));

  function revert(): void {
    setTaxable(savedTaxable);
    setNet(savedNet);
  }

  function save(): void {
    if (!changed || missingReason) {
      if (missingReason) messageApi.error(t('hr.payroll.entry.bonusReasonRequired'));
      return;
    }
    update.mutate(
      {
        entryId: row.id,
        payload: {
          ...(taxableChanged
            ? {
                bonusTopUp: taxable.amount ?? 0,
                bonusTopUpReason: taxable.reason.trim() || undefined,
              }
            : {}),
          ...(netChanged
            ? { netTopUp: net.amount ?? 0, netTopUpReason: net.reason.trim() || undefined }
            : {}),
        },
      },
      {
        onError: (error: unknown) =>
          notifyApiError(error, t(`${KEY}.saveFailed`), messageApi, t),
      },
    );
  }

  function onKeyDown(event: React.KeyboardEvent): void {
    if (event.key === 'Enter' && !(event.target instanceof HTMLTextAreaElement)) {
      event.preventDefault();
      save();
    } else if (event.key === 'Escape' && changed) {
      event.stopPropagation();
      revert();
    }
  }

  const rows: Array<{
    key: 'taxable' | 'net';
    label: string;
    sub: string;
    draft: TopUpDraft;
    set: (next: TopUpDraft) => void;
    effect: number;
  }> = [
    {
      key: 'taxable',
      label: t(`${KEY}.taxableTitle`),
      sub: t(`${KEY}.taxableDesc`),
      draft: taxable,
      set: setTaxable,
      effect: taxableEffect,
    },
    {
      key: 'net',
      label: t(`${KEY}.netTitle`),
      sub: t(`${KEY}.netDesc`),
      draft: net,
      set: setNet,
      effect: netEffect,
    },
  ];

  return (
    <div className="erp-otg" onKeyDown={canEdit ? onKeyDown : undefined}>
      <p className="erp-otg-hint">
        {canEdit ? t(`${KEY}.topUpHint`) : t(`${KEY}.topUpLocked`)}
      </p>
      <div className="erp-otg-scroll">
        <table className="erp-otg-table erp-otg-table--topups">
          <thead>
            <tr>
              <th scope="col">{t(`${KEY}.colType`)}</th>
              <th scope="col" className="is-num">{t(`${KEY}.colAmount`)}</th>
              <th scope="col">{t(`${KEY}.colReason`)}</th>
              <th scope="col" className="is-num">{t(`${KEY}.colNetEffect`)}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const reasonMissing = (item.draft.amount ?? 0) > 0 && !item.draft.reason.trim();
              return (
                <tr key={item.key}>
                  <th scope="row">
                    {item.label}
                    <small>{item.sub}</small>
                  </th>
                  <td className="is-num">
                    {canEdit ? (
                      <InputNumber
                        size="small"
                        controls={false}
                        min={0}
                        precision={2}
                        value={item.draft.amount}
                        placeholder="0"
                        aria-label={item.label}
                        className="erp-otg-input erp-otg-input--money"
                        onChange={(value) =>
                          item.set({
                            ...item.draft,
                            amount: typeof value === 'number' ? value : null,
                          })
                        }
                      />
                    ) : (
                      money(item.draft.amount)
                    )}
                  </td>
                  <td>
                    {canEdit ? (
                      <Input
                        size="small"
                        value={item.draft.reason}
                        maxLength={500}
                        status={reasonMissing ? 'error' : undefined}
                        placeholder={t(`${KEY}.reasonPlaceholder`)}
                        aria-label={t(`${KEY}.reasonFor`, { type: item.label })}
                        onChange={(event) =>
                          item.set({ ...item.draft, reason: event.target.value })
                        }
                      />
                    ) : (
                      item.draft.reason || '—'
                    )}
                  </td>
                  <td className={`is-num ${item.effect < 0 ? 'erp-otg-neg' : item.effect > 0 ? 'erp-otg-pos' : 'is-muted'}`}>
                    {item.effect === 0
                      ? '—'
                      : `${item.effect > 0 ? '+' : '−'}${money(Math.abs(item.effect))}`}
                  </td>
                </tr>
              );
            })}
            <tr className="is-readonly">
              <th scope="row">
                {t(`${KEY}.contractBonusTitle`)}
                <small>{t(`${KEY}.contractBonusDesc`)}</small>
              </th>
              <td className="is-num">{money(row.contractNetBonus)}</td>
              <td className="is-muted">—</td>
              <td className="is-num is-muted">—</td>
            </tr>
          </tbody>
        </table>
      </div>
      {canEdit && changed ? (
        <div className="erp-otg-foot">
          <p className="erp-otg-meta">
            {missingReason ? (
              <span className="is-error">{t('hr.payroll.entry.bonusReasonRequired')}</span>
            ) : (
              t(`${KEY}.unsaved`)
            )}
          </p>
          <div className="erp-otg-actions">
            <Button size="small" onClick={revert}>
              {t('hr.payroll.otAdjust.revert')}
            </Button>
            <Button size="small" type="primary" disabled={missingReason} onClick={save}>
              {t('hr.payroll.otAdjust.saveEnter')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
