'use client';

import { useCallback, useRef, useState } from 'react';
import { Button, Drawer, Tag, Tooltip } from 'antd';
import { FilePdfOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import PayrollEntryDetailPanel, {
  type PayrollEntryTab,
} from '@/components/modules/hr/payroll/PayrollEntryDetailPanel';
import { PayrollEntryDirtyProvider } from '@/components/modules/hr/payroll/payroll-entry-dirty';
import { useAppModal } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { PayrollEntryDetail, PayrollRunDetail } from '@/lib/api/payroll.types';
import {
  formatPayrollMoney,
  parsePayrollMoney,
  payrollFlagLabelKey,
} from '@/lib/utils/payroll-display';
import { formatUserName } from '@/lib/utils/user-display';

const KEY = 'hr.payroll.entryDrawer';
const DRAWER_WIDTH = 760;

/**
 * One payroll entry in a side drawer: who (name, ID, flags), the headline
 * figures, previous / next through the current table order, and the tabbed
 * detail panel. Asks before discarding unsaved edits when closing or moving.
 */
export default function PayrollEntryDrawer({
  entry,
  entries,
  run,
  canEdit,
  canChangeRun,
  canOverrideDays,
  payslipLoading,
  onOpenPayslip,
  onNavigate,
  onClose,
  onRemoveFreelancer,
}: {
  /** Entry shown; null closes the drawer. */
  entry: PayrollEntryDetail | null;
  /** Rows in the table's current order and filters (for previous / next). */
  entries: readonly PayrollEntryDetail[];
  run: PayrollRunDetail;
  canEdit: boolean;
  canChangeRun: boolean;
  canOverrideDays: boolean;
  payslipLoading: boolean;
  /** Set when payslips are shown for this run. */
  onOpenPayslip?: (payslipId: string) => void;
  onNavigate: (entryId: string) => void;
  onClose: () => void;
  onRemoveFreelancer: (row: PayrollEntryDetail) => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const modal = useAppModal();
  const [tab, setTab] = useState<PayrollEntryTab>('pay');
  const dirty = useRef(new Set<string>());

  const reportDirty = useCallback((id: string, isDirty: boolean) => {
    if (isDirty) {
      dirty.current.add(id);
    } else {
      dirty.current.delete(id);
    }
  }, []);

  /** Runs `action` now, or after the user agrees to discard unsaved edits. */
  function guard(action: () => void): void {
    if (dirty.current.size === 0) {
      action();
      return;
    }
    modal.confirm({
      title: t(`${KEY}.discardTitle`),
      content: t(`${KEY}.discardBody`),
      okText: t(`${KEY}.discard`),
      okButtonProps: { danger: true },
      cancelText: t(`${KEY}.keepEditing`),
      onOk: () => {
        dirty.current.clear();
        action();
      },
    });
  }

  const index = entry ? entries.findIndex((row) => row.id === entry.id) : -1;
  const previous = index > 0 ? entries[index - 1] : undefined;
  const next = index >= 0 && index < entries.length - 1 ? entries[index + 1] : undefined;
  const payslipId = entry?.payslip?.generatedAt ? entry.payslip.id : null;

  const deductions = entry
    ? parsePayrollMoney(entry.incomeTax) + parsePayrollMoney(entry.pensionEmployee)
    : 0;

  return (
    <Drawer
      open={entry != null}
      onClose={() => guard(onClose)}
      size={DRAWER_WIDTH}
      rootClassName="erp-pe-drawer"
      destroyOnHidden
      title={
        entry ? (
          <div className="erp-pe-drawer-title">
            <div className="min-w-0">
              <p className="erp-pe-drawer-name">{formatUserName(entry.employee)}</p>
              <p className="erp-pe-drawer-sub">
                <span>{entry.employee.employeeId ?? '—'}</span>
                {entry.employee.employeeType === 'FREELANCER' ? (
                  <Tag className="erp-pe-inline-tag">{t('hr.payroll.freelancers.tag')}</Tag>
                ) : null}
                {entry.flag !== 'NONE' ? (
                  <Tag variant="filled" className="erp-payroll-flag erp-pe-inline-tag">
                    {t(payrollFlagLabelKey(entry.flag))}
                  </Tag>
                ) : null}
                {entry.hasOverride ? (
                  <Tag color="orange" className="erp-pe-inline-tag">
                    {t('hr.payroll.entry.daysOverride.edited')}
                  </Tag>
                ) : null}
              </p>
            </div>
          </div>
        ) : null
      }
      extra={
        entry ? (
          <div className="erp-pe-drawer-nav">
            {index >= 0 ? (
              <span className="erp-pe-drawer-pos" aria-live="polite">
                {t(`${KEY}.position`, { current: index + 1, total: entries.length })}
              </span>
            ) : null}
            <Tooltip title={t(`${KEY}.previous`)}>
              <Button
                size="small"
                icon={<LeftOutlined />}
                aria-label={t(`${KEY}.previous`)}
                disabled={!previous}
                onClick={() => previous && guard(() => onNavigate(previous.id))}
              />
            </Tooltip>
            <Tooltip title={t(`${KEY}.next`)}>
              <Button
                size="small"
                icon={<RightOutlined />}
                aria-label={t(`${KEY}.next`)}
                disabled={!next}
                onClick={() => next && guard(() => onNavigate(next.id))}
              />
            </Tooltip>
          </div>
        ) : null
      }
    >
      {entry ? (
        <PayrollEntryDirtyProvider value={reportDirty}>
          <div className="erp-pe-drawer-body">
            <dl className="erp-pe-headline">
              <div>
                <dt>{t('hr.payroll.entry.paidDays')}</dt>
                <dd>{parsePayrollMoney(entry.payrollDays)}</dd>
              </div>
              <div>
                <dt>{t('hr.payroll.entry.gross')}</dt>
                <dd>{formatPayrollMoney(entry.grossIncome, { emptyZero: false })}</dd>
              </div>
              <div>
                <dt>{t(`${KEY}.deductions`)}</dt>
                <dd>{formatPayrollMoney(deductions, { emptyZero: false })}</dd>
              </div>
              <div className="is-net">
                <dt>{t('hr.payroll.entry.net')}</dt>
                <dd>
                  {formatPayrollMoney(entry.netPay, { emptyZero: false })}
                  <small> ETB</small>
                </dd>
              </div>
            </dl>
            {payslipId && onOpenPayslip ? (
              <Button
                size="small"
                icon={<FilePdfOutlined />}
                loading={payslipLoading}
                onClick={() => onOpenPayslip(payslipId)}
                className="erp-pe-payslip-btn"
              >
                {t('hr.payroll.payslips.openPdf')}
              </Button>
            ) : null}
            {/* Remount per employee so open forms never carry over. */}
            <PayrollEntryDetailPanel
              key={entry.id}
              row={entry}
              run={run}
              canEdit={canEdit}
              canChangeRun={canChangeRun}
              canOverrideDays={canOverrideDays}
              tab={tab}
              onTabChange={setTab}
              onRemoveFreelancer={onRemoveFreelancer}
            />
          </div>
        </PayrollEntryDirtyProvider>
      ) : null}
    </Drawer>
  );
}
