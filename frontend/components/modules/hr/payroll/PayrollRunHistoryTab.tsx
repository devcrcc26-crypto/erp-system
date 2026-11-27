'use client';

import Link from 'next/link';
import { Empty, Skeleton, Tag } from 'antd';
import dayjs from 'dayjs';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { PayrollRunHistoryItem } from '@/lib/api/payroll-adjustments';
import type { PayrollRunDetail } from '@/lib/api/payroll.types';
import { usePayrollRunHistory } from '@/lib/query/payroll-adjustments';
import {
  formatPayrollMoney,
  payrollStatusLabelKey,
  payrollStatusTagStyle,
} from '@/lib/utils/payroll-display';

const KEY = 'hr.payroll.history';

/**
 * Every version of the run's period (superseded ones with who reopened them,
 * when and why) and the related correction runs.
 */
export default function PayrollRunHistoryTab({ run }: { run: PayrollRunDetail }): React.ReactNode {
  const { t } = useEpcTranslation();
  const historyQuery = usePayrollRunHistory(run.id);
  const history = historyQuery.data;

  if (historyQuery.isLoading && !history) {
    return (
      <section className="erp-pro-card erp-payroll-panel">
        <Skeleton active paragraph={{ rows: 4 }} />
      </section>
    );
  }

  const item = (row: PayrollRunHistoryItem): React.ReactNode => {
    const current = row.id === run.id;
    return (
      <li key={row.id} className={`erp-payroll-history-item${current ? ' erp-payroll-history-item--current' : ''}`}>
        <div className="erp-payroll-history-head">
          <div className="min-w-0">
            <p className="erp-payroll-history-title">
              {current ? (
                <span>{row.runNumber}</span>
              ) : (
                <Link href={`/hr/payroll/${row.id}`}>{row.runNumber}</Link>
              )}
              <span className="erp-payroll-history-version">
                {t(`${KEY}.version`, { version: row.version })}
              </span>
              {current ? <Tag className="erp-payroll-history-current">{t(`${KEY}.current`)}</Tag> : null}
            </p>
            <p className="erp-payroll-muted-note">
              {dayjs(row.createdAt).format('YYYY-MM-DD')}
              {row.approvedAt ? ` · ${t('hr.payroll.steps.hrApproved')} ${dayjs(row.approvedAt).format('YYYY-MM-DD')}` : ''}
              {row.paidAt ? ` · ${t('hr.payroll.steps.paid')} ${dayjs(row.paidAt).format('YYYY-MM-DD')}` : ''}
              {` · ${formatPayrollMoney(row.totalNetPay, { emptyZero: false })} ETB`}
            </p>
          </div>
          <Tag variant="filled" className="erp-payroll-status" style={payrollStatusTagStyle(row.status)}>
            {t(payrollStatusLabelKey(row.status))}
          </Tag>
        </div>
        {row.reopenReason ? (
          <div className="erp-payroll-history-reason">
            <p className="erp-payroll-muted-note">
              {t(`${KEY}.reopened`, {
                name: row.reopenedByName ?? '-',
                date: row.reopenedAt ? dayjs(row.reopenedAt).format('YYYY-MM-DD HH:mm') : '-',
              })}
            </p>
            <p className="m-0">
              <strong>{t(`${KEY}.reason`)}:</strong> {row.reopenReason}
            </p>
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <div className="erp-payroll-tab-stack">
      {history?.originalRun ? (
        <section className="erp-pro-card erp-payroll-panel">
          <h3 className="erp-payroll-panel-title">{t(`${KEY}.original`)}</h3>
          <ul className="erp-payroll-history-list">{item(history.originalRun)}</ul>
        </section>
      ) : null}

      <section className="erp-pro-card erp-payroll-panel">
        <h3 className="erp-payroll-panel-title">{t(`${KEY}.versions`)}</h3>
        {history && history.versions.length > 0 ? (
          <ul className="erp-payroll-history-list">{history.versions.map(item)}</ul>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t(`${KEY}.empty`)} />
        )}
      </section>

      <section className="erp-pro-card erp-payroll-panel">
        <h3 className="erp-payroll-panel-title">{t(`${KEY}.corrections`)}</h3>
        {history && history.corrections.length > 0 ? (
          <ul className="erp-payroll-history-list">{history.corrections.map(item)}</ul>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t(`${KEY}.noCorrections`)} />
        )}
      </section>
    </div>
  );
}
