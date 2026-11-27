'use client';

import { useState } from 'react';
import { Button } from 'antd';
import { CloseOutlined, WarningOutlined } from '@ant-design/icons';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { PayrollRunWarnings } from '@/lib/api/payroll-adjustments';
import type { PayrollRunDetail } from '@/lib/api/payroll.types';

export type PayrollRunTab = 'summary' | 'employees' | 'adjustments' | 'history';

const KEY = 'hr.payroll.warnings';

interface Item {
  key: string;
  label: string;
  tab: PayrollRunTab;
}

/**
 * One compact, dismissible bar with everything a run still needs: counts that
 * jump to the tab where it is handled, instead of a stack of banners.
 */
export default function PayrollRunWarningsBar({
  run,
  warnings,
  flaggedCount,
  onSelectTab,
}: {
  run: PayrollRunDetail;
  warnings: PayrollRunWarnings | undefined;
  flaggedCount: number;
  onSelectTab: (tab: PayrollRunTab) => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  // Dismissal lasts until the warnings change (new key) or the page reloads.
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  const items: Item[] = [];
  const employees = (rows: Array<{ employeeId: string }>): number =>
    new Set(rows.map((row) => row.employeeId)).size;
  if (warnings && warnings.pendingOvertime.length > 0) {
    items.push({
      key: 'pendingOvertime',
      label: t(`${KEY}.pendingOvertime`, { count: employees(warnings.pendingOvertime) }),
      tab: 'summary',
    });
  }
  if (warnings && warnings.overtimeNotIncluded.length > 0) {
    items.push({
      key: 'overtimeNotIncluded',
      label: t(`${KEY}.overtimeNotIncluded`, { count: employees(warnings.overtimeNotIncluded) }),
      tab: 'summary',
    });
  }
  if (warnings && warnings.overtimeChangedSinceCalculation.length > 0) {
    items.push({
      key: 'overtimeChanged',
      label: t(`${KEY}.overtimeChanged`, {
        count: warnings.overtimeChangedSinceCalculation.reduce((sum, row) => sum + row.entries, 0),
      }),
      tab: 'summary',
    });
  }
  if (warnings && warnings.openReconciliations.length > 0) {
    items.push({
      key: 'openReconciliations',
      label: t(`${KEY}.openReconciliations`, { count: warnings.openReconciliations.length }),
      tab: 'adjustments',
    });
  }
  if (warnings && warnings.deductionsOverCap.length > 0) {
    items.push({
      key: 'deductionsOverCap',
      label: t(`${KEY}.deductionsOverCap`, { count: warnings.deductionsOverCap.length }),
      tab: 'adjustments',
    });
  }
  const negativeNet = warnings?.negativeNetPay.filter((row) => !row.settlementOnly) ?? [];
  // A settlement-only recovery cannot be paid out: the money is collected from the employee.
  const collectFromEmployees = warnings?.negativeNetPay.filter((row) => row.settlementOnly) ?? [];
  if (negativeNet.length > 0) {
    items.push({
      key: 'negativeNet',
      label: t(`${KEY}.negativeNet`, { count: negativeNet.length }),
      tab: 'employees',
    });
  }
  if (collectFromEmployees.length > 0) {
    items.push({
      key: 'collectFromEmployee',
      label: t(`${KEY}.collectFromEmployee`, { count: collectFromEmployees.length }),
      tab: 'adjustments',
    });
  }
  if (flaggedCount > 0) {
    items.push({
      key: 'flagged',
      label: t(`${KEY}.flagged`, { count: flaggedCount }),
      tab: 'employees',
    });
  }
  if (run.attendanceSnapshotStale) {
    items.push({ key: 'attendanceStale', label: t(`${KEY}.attendanceStale`), tab: 'summary' });
  }
  if (run.policyReviewRequired) {
    items.push({ key: 'policyReview', label: t(`${KEY}.policyReview`), tab: 'summary' });
  }

  const key = items.map((item) => item.label).join('|');
  if (items.length === 0 || dismissedKey === key) {
    return null;
  }

  return (
    <div className="erp-payroll-warnbar" role="status">
      <span className="erp-payroll-warnbar-icon" aria-hidden>
        <WarningOutlined />
      </span>
      <span className="erp-payroll-warnbar-label">{t(`${KEY}.label`)}</span>
      <ul className="erp-payroll-warnbar-items">
        {items.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              className="erp-payroll-warnbar-link"
              onClick={() => onSelectTab(item.tab)}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
      <Button
        type="text"
        size="small"
        className="erp-payroll-warnbar-close"
        icon={<CloseOutlined />}
        aria-label={t(`${KEY}.dismiss`)}
        onClick={() => setDismissedKey(key)}
      />
    </div>
  );
}
