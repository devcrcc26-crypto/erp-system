'use client';

import { Alert, Checkbox, Spin } from 'antd';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { PayrollEmploymentReviewEntry } from '@/lib/api/payroll.types';
import { payrollFlagLabelKey } from '@/lib/utils/payroll-display';

/**
 * Employees with employment flags (contract ended, login disabled while
 * employed, leaver final month, inactive in month) that must be reviewed
 * before the run is submitted or approved. Nothing renders when there are none.
 */
export default function PayrollEmploymentReviewPanel({
  entries,
  loading,
  reviewed,
  onReviewedChange,
}: {
  entries: PayrollEmploymentReviewEntry[] | undefined;
  loading: boolean;
  reviewed: boolean;
  onReviewedChange: (reviewed: boolean) => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  if (loading) {
    return <Spin size="small" />;
  }
  if (!entries || entries.length === 0) {
    return null;
  }
  return (
    <Alert
      type="warning"
      showIcon
      className="mt-3"
      title={t('hr.payroll.employmentReview.title', { count: entries.length })}
      description={
        <div className="flex flex-col gap-2">
          <ul className="m-0 flex max-h-64 list-none flex-col gap-1.5 overflow-y-auto p-0">
            {entries.map((entry) => (
              <li key={entry.entryId} className="text-sm">
                <strong>{entry.employeeName}</strong>
                {entry.employeeCode ? ` (${entry.employeeCode})` : ''}
                {' - '}
                {t(payrollFlagLabelKey(entry.flag))}
                {entry.flagNote ? (
                  <div className="text-xs text-[var(--erp-text-secondary,#4B5563)]">
                    {entry.flagNote}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <Checkbox checked={reviewed} onChange={(event) => onReviewedChange(event.target.checked)}>
            {t('hr.payroll.employmentReview.confirm', { count: entries.length })}
          </Checkbox>
        </div>
      }
    />
  );
}
