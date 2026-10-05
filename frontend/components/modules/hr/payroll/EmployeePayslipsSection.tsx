'use client';

import { useState } from 'react';
import { Button, Drawer, Empty, Spin, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { openPayslipPdf } from '@/lib/api/payroll';
import type { EmployeePayslip } from '@/lib/api/payroll.types';
import { useEmployeePayslips, useMyPayslips } from '@/lib/query/payroll';
import {
  formatPayrollMoney,
  formatPayrollPeriod,
  parsePayrollMoney,
} from '@/lib/utils/payroll-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';

function BreakdownRow({
  label,
  amount,
  strong,
}: {
  label: string;
  amount: string;
  strong?: boolean;
}): React.ReactNode {
  return (
    <div className="flex items-start justify-between gap-4 py-1 text-sm">
      <span className={strong ? 'font-medium' : undefined}>{label}</span>
      <span
        className="shrink-0 text-right"
        style={{ fontVariantNumeric: 'tabular-nums', fontWeight: strong ? 600 : undefined }}
      >
        {amount}
      </span>
    </div>
  );
}

/**
 * Released payslips for the signed-in employee, or generated payslips when HR
 * opens another employee's profile.
 */
export default function EmployeePayslipsSection({
  mode,
  employeeId,
}: {
  mode: 'self' | 'employee';
  employeeId?: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const mine = useMyPayslips(mode === 'self');
  const theirs = useEmployeePayslips(employeeId ?? '', mode === 'employee');
  const query = mode === 'self' ? mine : theirs;
  const [selected, setSelected] = useState<EmployeePayslip | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function download(payslipId: string): Promise<void> {
    setDownloadingId(payslipId);
    try {
      await openPayslipPdf(payslipId);
    } catch (error) {
      notifyApiError(error, t('profile.payroll.download'), messageApi, t);
    } finally {
      setDownloadingId(null);
    }
  }

  if (query.isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Spin />
      </div>
    );
  }

  if (query.isError) {
    return <p className="m-0 text-sm">{t('profile.payroll.loadError')}</p>;
  }

  const rows = query.data ?? [];
  if (rows.length === 0) {
    return <Empty description={t('profile.payroll.empty')} />;
  }

  const columns: ColumnsType<EmployeePayslip> = [
    {
      title: t('profile.payroll.period'),
      key: 'period',
      render: (_, row) => formatPayrollPeriod(row.month, row.year),
    },
    {
      title: t('profile.payroll.netPay'),
      key: 'net',
      align: 'right',
      render: (_, row) =>
        `${formatPayrollMoney(row.netPay, { emptyZero: false })} ETB`,
    },
    {
      title: t('profile.payroll.released'),
      key: 'released',
      render: (_, row) =>
        row.released && row.releasedAt ? (
          dayjs(row.releasedAt).format('YYYY-MM-DD')
        ) : (
          <Tag>{t('profile.payroll.notReleased')}</Tag>
        ),
    },
    {
      title: '',
      key: 'actions',
      render: (_, row) => (
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="link" className="px-0" onClick={() => setSelected(row)}>
            {t('profile.payroll.viewBreakdown')}
          </Button>
          <Button
            type="link"
            className="px-0"
            loading={downloadingId === row.id}
            onClick={() => void download(row.id)}
          >
            {t('profile.payroll.download')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <Table<EmployeePayslip>
        rowKey="id"
        size="small"
        pagination={false}
        columns={columns}
        dataSource={rows}
      />
      <Drawer
        title={
          selected
            ? `${t('profile.payroll.breakdownTitle')} · ${formatPayrollPeriod(selected.month, selected.year)}`
            : t('profile.payroll.breakdownTitle')
        }
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        width={440}
      >
        {selected ? <PayslipBreakdown payslip={selected} /> : null}
      </Drawer>
    </>
  );
}

function PayslipBreakdown({ payslip }: { payslip: EmployeePayslip }): React.ReactNode {
  const { t } = useEpcTranslation();
  const money = (value: EmployeePayslip['netPay']): string =>
    formatPayrollMoney(value, { emptyZero: false });
  const hours = (value: EmployeePayslip['normalOtHours']): number =>
    parsePayrollMoney(value);

  const overtime = [
    {
      hours: hours(payslip.normalOtHours),
      label: t('profile.payroll.otNormal', { hours: hours(payslip.normalOtHours) }),
      amount: payslip.normalOtPay,
    },
    {
      hours: hours(payslip.eveningOtHours),
      label: t('profile.payroll.otEvening', { hours: hours(payslip.eveningOtHours) }),
      amount: payslip.eveningOtPay,
    },
    {
      hours: hours(payslip.sundayOtHours),
      label: t('profile.payroll.otSunday', { hours: hours(payslip.sundayOtHours) }),
      amount: payslip.sundayOtPay,
    },
    {
      hours: hours(payslip.holidayOtHours),
      label: t('profile.payroll.otHoliday', { hours: hours(payslip.holidayOtHours) }),
      amount: payslip.holidayOtPay,
    },
  ].filter((row) => row.hours > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm">
        <p className="m-0">
          {payslip.employeeName}
          {payslip.employeeCode ? ` · ${payslip.employeeCode}` : ''}
        </p>
        <p className="m-0 mt-1 text-[var(--color-text-tertiary)]">
          {t('profile.payroll.paidDays')}:{' '}
          {t('profile.payroll.paidDaysOf', { days: parsePayrollMoney(payslip.paidDays) })}
        </p>
        <p className="m-0 mt-1 text-[var(--color-text-tertiary)]">
          {t('profile.payroll.bank')}: {payslip.bankName || '—'} · {t('profile.payroll.account')}:{' '}
          {payslip.bankAccountMasked || '—'}
        </p>
      </div>

      <div>
        <p className="mb-1 font-medium">{t('profile.payroll.earnings')}</p>
        <BreakdownRow
          label={`${t('profile.payroll.basic')} (${t('profile.payroll.basicFormula', {
            basic: money(payslip.basicSalary),
            days: parsePayrollMoney(payslip.paidDays),
          })})`}
          amount={money(payslip.earnedSalary)}
        />
        {overtime.length > 0 ? (
          <p className="mb-0 mt-2 text-sm">{t('profile.payroll.overtime')}</p>
        ) : null}
        {overtime.map((row) => (
          <BreakdownRow key={row.label} label={row.label} amount={money(row.amount)} />
        ))}
        <BreakdownRow
          label={t('profile.payroll.transport')}
          amount={money(payslip.transportAllowance)}
        />
        <BreakdownRow label={t('profile.payroll.bonus')} amount={money(payslip.monthlyBonus)} />
        {parsePayrollMoney(payslip.bonusTopUp) > 0 ? (
          <BreakdownRow
            label={
              payslip.bonusTopUpReason
                ? `${t('profile.payroll.bonusTopUp')} (${payslip.bonusTopUpReason})`
                : t('profile.payroll.bonusTopUp')
            }
            amount={money(payslip.bonusTopUp)}
          />
        ) : null}
        <BreakdownRow label={t('profile.payroll.gross')} amount={money(payslip.grossIncome)} strong />
      </div>

      <div>
        <p className="mb-1 font-medium">{t('profile.payroll.deductions')}</p>
        <BreakdownRow
          label={t('profile.payroll.pension')}
          amount={
            payslip.pensionApplicable
              ? money(payslip.pensionEmployee)
              : t('profile.payroll.pensionNa')
          }
        />
        <BreakdownRow label={t('profile.payroll.tax')} amount={money(payslip.incomeTax)} />
        <BreakdownRow
          label={t('profile.payroll.totalDeductions')}
          amount={money(payslip.totalDeductions)}
          strong
        />
      </div>

      <BreakdownRow
        label={t('profile.payroll.net')}
        amount={`ETB ${money(payslip.netPay)}`}
        strong
      />
      <p className="m-0 text-sm text-[var(--color-text-tertiary)]">
        {t('profile.payroll.employerPension')}:{' '}
        {payslip.pensionApplicable
          ? money(payslip.pensionEmployer)
          : t('profile.payroll.pensionNa')}
      </p>
    </div>
  );
}
