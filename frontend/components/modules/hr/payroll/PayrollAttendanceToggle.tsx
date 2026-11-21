'use client';

import { useId } from 'react';
import { Alert, Switch } from 'antd';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

const KEY = 'hr.payroll.attendanceSetting';

/**
 * "Consider attendance" switch for a payroll run (create form and run page).
 * Off = payroll ignores attendance and only approved leave reduces pay; a
 * warning explains that. `wrapSwitch` lets the run page put a confirmation
 * around the switch, because changing it recalculates the run.
 */
export default function PayrollAttendanceToggle({
  checked,
  onChange,
  disabled = false,
  loading = false,
  hint,
  wrapSwitch,
  className = '',
}: {
  checked: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  loading?: boolean;
  /** Extra line under the state text (e.g. why it is locked). */
  hint?: string;
  wrapSwitch?: (switchNode: React.ReactNode) => React.ReactNode;
  className?: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const labelId = useId();
  const stateId = useId();

  const switchNode = (
    <Switch
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      loading={loading}
      aria-labelledby={labelId}
      aria-describedby={stateId}
    />
  );

  return (
    <div className={`erp-payroll-attendance-toggle ${className}`.trim()}>
      <div className="erp-payroll-attendance-toggle-row">
        {wrapSwitch ? wrapSwitch(switchNode) : switchNode}
        <div className="min-w-0">
          <p id={labelId} className="erp-payroll-attendance-toggle-label">
            {t(`${KEY}.label`)}
          </p>
          <p id={stateId} className="erp-payroll-attendance-toggle-state">
            {checked ? t(`${KEY}.on`) : t(`${KEY}.off`)}
          </p>
          {hint ? <p className="erp-payroll-attendance-toggle-hint">{hint}</p> : null}
        </div>
      </div>
      {!checked ? (
        <Alert
          className="erp-payroll-attendance-toggle-warning"
          type="warning"
          showIcon
          title={t(`${KEY}.warning`)}
        />
      ) : null}
    </div>
  );
}
