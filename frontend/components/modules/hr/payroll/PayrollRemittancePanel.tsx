'use client';

import { Skeleton, Tag } from 'antd';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { PayrollRemittanceSection } from '@/lib/api/payroll-adjustments';
import { usePayrollRunRemittance } from '@/lib/query/payroll-adjustments';
import { formatPayrollMoney } from '@/lib/utils/payroll-display';

const KEY = 'hr.payroll.remittance';

const signed = (value: number): string =>
  `${value < 0 ? '−' : '+'}${formatPayrollMoney(Math.abs(value), { emptyZero: false })}`;

/**
 * Income tax and pension to declare for the run: its own totals plus the tax
 * and pension differences of corrections it settles first, as labelled lines.
 * Only shown when the run carries correction differences.
 */
export default function PayrollRemittancePanel({ runId }: { runId: string }): React.ReactNode {
  const { t } = useEpcTranslation();
  const query = usePayrollRunRemittance(runId);
  const data = query.data;

  if (query.isLoading) {
    return (
      <section className="erp-pro-card erp-payroll-panel">
        <Skeleton active paragraph={{ rows: 3 }} title={false} />
      </section>
    );
  }
  if (!data) {
    return null;
  }
  const sections: Array<[string, PayrollRemittanceSection]> = [
    [t(`${KEY}.incomeTax`), data.incomeTax],
    [t(`${KEY}.pensionEmployee`), data.pensionEmployee],
    [t(`${KEY}.pensionEmployer`), data.pensionEmployer],
  ];
  if (sections.every(([, section]) => section.adjustments.length === 0)) {
    return null;
  }

  return (
    <section className="erp-pro-card erp-payroll-panel">
      <header className="erp-payroll-panel-head">
        <div className="min-w-0">
          <h3 className="erp-payroll-panel-title">{t(`${KEY}.title`)}</h3>
          <p className="erp-payroll-panel-desc">{t(`${KEY}.hint`)}</p>
        </div>
      </header>
      <div className="erp-payroll-remit-grid">
        {sections.map(([title, section]) => (
          <dl key={title} className="erp-payroll-remit">
            <dt className="erp-payroll-followup-title">{title}</dt>
            <div className="erp-payroll-remit-row">
              <dd>{t(`${KEY}.thisRun`)}</dd>
              <dd className="erp-payroll-num">
                {formatPayrollMoney(section.runAmount, { emptyZero: false })}
              </dd>
            </div>
            {section.adjustments.map((line) => (
              <div key={`${line.label}-${line.reconciliationId}`} className="erp-payroll-remit-row">
                <dd className="min-w-0">
                  <span>{line.label}</span>
                  {line.pending ? (
                    <Tag className="erp-payroll-adj-builtin ml-1">{t(`${KEY}.pending`)}</Tag>
                  ) : null}
                  {line.detail ? <p className="erp-payroll-muted-note">{line.detail}</p> : null}
                </dd>
                <dd className="erp-payroll-num">{signed(line.amount)}</dd>
              </div>
            ))}
            <div className="erp-payroll-remit-row erp-payroll-remit-total">
              <dd>{t(`${KEY}.total`)}</dd>
              <dd className="erp-payroll-num">
                {formatPayrollMoney(section.total, { emptyZero: false })}
              </dd>
            </div>
          </dl>
        ))}
      </div>
    </section>
  );
}
