'use client';

import './payroll-v2.css';
import { useMemo, useState } from 'react';
import { Button, Drawer, Spin, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DownloadOutlined } from '@ant-design/icons';
import { ReceiptText } from 'lucide-react';
import dayjs from 'dayjs';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { openPayslipPdf } from '@/lib/api/payroll';
import type { EmployeePayslip } from '@/lib/api/payroll.types';
import { useEmployeePayslips, useMyPayslips } from '@/lib/query/payroll';
import {
  monthOverlapsContractPeriod,
  type ProfileContractPeriod,
} from '@/lib/utils/contract-period';
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
    <div className={`erp-payslip-row${strong ? ' erp-payslip-row--total' : ''}`}>
      <span>{label}</span>
      <span>{amount}</span>
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
  contractPeriod = null,
}: {
  mode: 'self' | 'employee';
  employeeId?: string;
  contractPeriod?: ProfileContractPeriod | null;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const mine = useMyPayslips(mode === 'self');
  const theirs = useEmployeePayslips(employeeId ?? '', mode === 'employee');
  const query = mode === 'self' ? mine : theirs;
  const [selected, setSelected] = useState<EmployeePayslip | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const all = query.data ?? [];
    if (!contractPeriod) {
      return all;
    }
    return all.filter((row) =>
      monthOverlapsContractPeriod(row.year, row.month, contractPeriod),
    );
  }, [query.data, contractPeriod]);

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

  if (rows.length === 0) {
    return (
      <div className="erp-payslips-v2">
        <div className="erp-payslips-empty">
          <span className="erp-payslips-empty-icon" aria-hidden>
            <ReceiptText size={22} strokeWidth={1.75} />
          </span>
          <p className="m-0">{t('profile.payroll.empty')}</p>
        </div>
      </div>
    );
  }

  const columns: ColumnsType<EmployeePayslip> = [
    {
      title: t('profile.payroll.period'),
      key: 'period',
      render: (_, row) => (
        <span className="erp-payslip-period">{formatPayrollPeriod(row.month, row.year)}</span>
      ),
    },
    {
      title: t('profile.payroll.netPay'),
      key: 'net',
      align: 'right',
      render: (_, row) => (
        <span className="erp-payslip-net">
          {formatPayrollMoney(row.netPay, { emptyZero: false })}
          <span>ETB</span>
        </span>
      ),
    },
    {
      title: t('profile.payroll.released'),
      key: 'released',
      render: (_, row) =>
        row.released && row.releasedAt ? (
          <span className="erp-payslip-state">
            {dayjs(row.releasedAt).format('YYYY-MM-DD')}
          </span>
        ) : (
          <span className="erp-payslip-state erp-payslip-state--pending">
            {t('profile.payroll.notReleased')}
          </span>
        ),
    },
    {
      title: '',
      key: 'actions',
      render: (_, row) => (
        <div className="erp-payslip-actions">
          <Button size="small" onClick={() => setSelected(row)}>
            {t('profile.payroll.viewBreakdown')}
          </Button>
          <Button
            size="small"
            icon={<DownloadOutlined />}
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
    <div className="erp-payslips-v2">
      <Table<EmployeePayslip>
        rowKey="id"
        size="small"
        pagination={false}
        columns={columns}
        dataSource={rows}
        scroll={{ x: 560 }}
      />
      <Drawer
        rootClassName="erp-payslip-drawer"
        title={
          selected
            ? `${t('profile.payroll.breakdownTitle')} · ${formatPayrollPeriod(selected.month, selected.year)}`
            : t('profile.payroll.breakdownTitle')
        }
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        size={440}
      >
        {selected ? <PayslipBreakdown payslip={selected} /> : null}
      </Drawer>
    </div>
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
    <div className="flex flex-col gap-3">
      <div className="erp-payslip-hero">
        <p className="erp-payslip-hero-label">{t('profile.payroll.net')}</p>
        <p className="erp-payslip-hero-amount">
          {money(payslip.netPay)}
          <span>ETB</span>
        </p>
        <p className="erp-payslip-hero-who">
          {payslip.employeeName}
          {payslip.employeeCode ? ` · ${payslip.employeeCode}` : ''}
        </p>
      </div>

      <div className="erp-payslip-facts">
        <div className="erp-payslip-fact">
          <p>{t('profile.payroll.paidDays')}</p>
          <p>{t('profile.payroll.paidDaysOf', { days: parsePayrollMoney(payslip.paidDays) })}</p>
        </div>
        <div className="erp-payslip-fact">
          <p>{t('profile.payroll.bank')}</p>
          <p>{payslip.bankName || '-'}</p>
        </div>
        <div className="erp-payslip-fact erp-payslip-fact--wide">
          <p>{t('profile.payroll.account')}</p>
          <p>{payslip.bankAccountMasked || '-'}</p>
        </div>
      </div>

      <section className="erp-payslip-section">
        <p className="erp-payslip-section-title">{t('profile.payroll.earnings')}</p>
        <BreakdownRow
          label={`${t('profile.payroll.basic')} (${t('profile.payroll.basicFormula', {
            basic: money(payslip.basicSalary),
            days: parsePayrollMoney(payslip.paidDays),
          })})`}
          amount={money(payslip.earnedSalary)}
        />
        {overtime.length > 0 ? (
          <p className="erp-payslip-subtitle">{t('profile.payroll.overtime')}</p>
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
      </section>

      <section className="erp-payslip-section">
        <p className="erp-payslip-section-title">{t('profile.payroll.deductions')}</p>
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
      </section>

      {parsePayrollMoney(payslip.contractNetBonus) +
        parsePayrollMoney(payslip.netTopUp) >
      0 ? (
        <section className="erp-payslip-section">
          <BreakdownRow
            label={
              parsePayrollMoney(payslip.netTopUp) > 0 &&
              payslip.netTopUpReason?.trim()
                ? `${t('profile.payroll.netBonus')} (${payslip.netTopUpReason.trim()})`
                : t('profile.payroll.netBonus')
            }
            amount={money(
              parsePayrollMoney(payslip.contractNetBonus) +
                parsePayrollMoney(payslip.netTopUp),
            )}
          />
        </section>
      ) : null}

      <p className="erp-payslip-note">
        {t('profile.payroll.employerPension')}:{' '}
        {payslip.pensionApplicable
          ? money(payslip.pensionEmployer)
          : t('profile.payroll.pensionNa')}
      </p>
    </div>
  );
}
