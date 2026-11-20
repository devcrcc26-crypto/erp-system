'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Form, Input, InputNumber, Modal, Spin } from 'antd';
import {
  CalendarOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import EvaluationListAvatar from '@/components/modules/hr/evaluation/EvaluationListAvatar';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAppMessage } from '@/hooks/use-app-message';
import type {
  EmployeeLeaveBalanceSummary,
  LeaveBalance,
  LeaveType,
  LeaveYearOption,
} from '@/lib/api/leave.types';
import {
  useLeaveYears,
  useMyLeaveBalances,
  useSetLeaveBalanceSnapshot,
} from '@/lib/query/leave';
import { formatLeaveEmployeeName, formatLeaveType } from '@/lib/utils/leave-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import './leave-v2.css';

const KEY = 'hr.leave.ledger';

/**
 * Only annual leave is set by hand. Maternity and paternity entitlements are
 * fixed by Ethiopian Labour Proclamation No. 1156/2019 and are created
 * automatically when the leave year opens, so they never appear here.
 */
const EDITABLE_LEAVE_TYPES: LeaveType[] = ['ANNUAL'];

interface SnapshotRowValues {
  leaveType: LeaveType;
  entitled: number;
  broughtForward: number;
  used: number;
}

interface SnapshotFormValues {
  year: number;
  reason: string;
  rows: SnapshotRowValues[];
}

/** Remaining = Entitlement + Brought Forward − Used − Pending (one decimal). */
function remainingOf(row: {
  entitled?: number | null;
  broughtForward?: number | null;
  used?: number | null;
  pending?: number | null;
}): number {
  const entitled = Number(row.entitled ?? 0);
  const broughtForward = Number(row.broughtForward ?? 0);
  const used = Number(row.used ?? 0);
  const pending = Number(row.pending ?? 0);
  return Math.round((entitled + broughtForward - used - pending) * 10) / 10;
}

/**
 * The balance for a type in the selected cycle. The list summary is only a
 * stand-in while that cycle's balances load, and only when it is the same
 * cycle, so switching cycles never shows another cycle's figures.
 */
function existingBalance(
  leaveType: LeaveType,
  year: number,
  balances: LeaveBalance[] | undefined,
  summary: EmployeeLeaveBalanceSummary | null,
): LeaveBalance | null | undefined {
  const fromCycle = balances?.find((row) => row.leaveType === leaveType);
  if (fromCycle) {
    return fromCycle;
  }
  if (leaveType === 'ANNUAL' && summary?.year === year) {
    return summary.annual;
  }
  return undefined;
}

function rowsFromBalances(
  leaveTypes: LeaveType[],
  year: number,
  balances: LeaveBalance[] | undefined,
  summary: EmployeeLeaveBalanceSummary | null,
): SnapshotRowValues[] {
  return leaveTypes.map((leaveType) => {
    const existing = existingBalance(leaveType, year, balances, summary);
    return {
      leaveType,
      entitled: existing?.entitled ?? 0,
      broughtForward: existing?.broughtForward ?? 0,
      used: existing?.used ?? 0,
    };
  });
}

/**
 * Exact leave-year dates, e.g. "Jun 5, 2026 – Jun 4, 2027". A leave year
 * starts on the contract start date (or its anniversary) and ends the day
 * before the next one, so the exact days matter, not just month and year.
 */
function cycleRange(cycle: LeaveYearOption): string {
  return `${formatProjectDate(cycle.start)} – ${formatProjectDate(cycle.end)}`;
}

const DAY_INPUT = {
  className: 'w-full',
  min: 0,
  max: 365,
  step: 0.5,
  precision: 1,
} as const;

/**
 * Selectable chips in a tablist. Each chip has a small top line (contract
 * number) and the exact leave-year dates below.
 */
function PeriodTabs<T extends string | number>({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: Array<{ value: T; title: string; caption?: string }>;
  value: T | null;
  onChange: (value: T) => void;
}): React.ReactNode {
  return (
    <div role="tablist" aria-label={label} className="erp-lbm-tabs">
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={String(item.value)}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className="erp-lbm-tab"
            onClick={() => onChange(item.value)}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') {
                return;
              }
              event.preventDefault();
              const index = items.findIndex((entry) => entry.value === item.value);
              const step = event.key === 'ArrowRight' ? 1 : -1;
              const next = items[(index + step + items.length) % items.length];
              if (next) {
                onChange(next.value);
                const buttons =
                  event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                    '[role="tab"]',
                  );
                buttons?.[(index + step + items.length) % items.length]?.focus();
              }
            }}
          >
            {item.caption ? (
              <span className="erp-lbm-tab-caption">{item.caption}</span>
            ) : null}
            <span className="erp-lbm-tab-title">{item.title}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * HR / GM / System Admin modal to set annual leave entitlement, brought
 * forward and used for one contract leave year. Pick the leave year (exact
 * dates); the balance below is that year's, and saving writes to that year.
 */
export default function LeaveBalanceEditModal({
  open,
  employeeSummary,
  defaultYear,
  onClose,
}: {
  open: boolean;
  employeeSummary: EmployeeLeaveBalanceSummary | null;
  defaultYear: number;
  onClose: () => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<SnapshotFormValues>();
  const employeeId = employeeSummary?.employeeId;
  const leaveTypes = EDITABLE_LEAVE_TYPES;
  const year = Form.useWatch('year', form) ?? defaultYear;
  const leaveYearsQuery = useLeaveYears(employeeId, open && Boolean(employeeId));
  const balancesQuery = useMyLeaveBalances({
    year,
    employeeId,
    enabled: open && Boolean(employeeId),
  });
  const snapshotMutation = useSetLeaveBalanceSnapshot();
  const watchedRows = Form.useWatch('rows', form);
  /** `employeeId:cycle` pairs HR chose to initialize (no record yet). */
  const [initialized, setInitialized] = useState<ReadonlySet<string>>(new Set());
  const cycleKey = `${employeeId ?? ''}:${year}`;

  /** One entry per leave year (newest first); the label is the balance key. */
  const cycles = useMemo(() => {
    const seen = new Set<number>();
    return (leaveYearsQuery.data?.years ?? []).filter((cycle) => {
      if (seen.has(cycle.label)) {
        return false;
      }
      seen.add(cycle.label);
      return true;
    });
  }, [leaveYearsQuery.data?.years]);
  const currentLabel = leaveYearsQuery.data?.current.label;
  const selectedCycle: LeaveYearOption | null =
    cycles.find((cycle) => cycle.label === year) ?? null;

  // Seed year + reason when the modal opens for an employee.
  useEffect(() => {
    if (!open || !employeeSummary) {
      return;
    }
    const years = leaveYearsQuery.data?.years ?? [];
    const preferred =
      years.find((option) => option.label === defaultYear)?.label ??
      leaveYearsQuery.data?.current.label ??
      defaultYear;
    form.setFieldsValue({
      year: preferred,
      reason: '',
      rows: rowsFromBalances(leaveTypes, preferred, undefined, employeeSummary),
    });
  }, [
    open,
    employeeSummary?.employeeId,
    defaultYear,
    leaveTypes,
    form,
    leaveYearsQuery.data,
  ]);

  // Load the selected cycle's balances into the form.
  useEffect(() => {
    if (!open || !employeeSummary || !balancesQuery.data) {
      return;
    }
    form.setFieldsValue({
      rows: rowsFromBalances(
        leaveTypes,
        year,
        balancesQuery.data,
        employeeSummary,
      ),
    });
  }, [open, employeeSummary, leaveTypes, year, balancesQuery.data, form]);

  function selectCycle(label: number): void {
    if (label === year) {
      return;
    }
    // Clear the figures until the new cycle's balances arrive.
    form.setFieldsValue({
      year: label,
      rows: rowsFromBalances(leaveTypes, label, undefined, employeeSummary),
    });
  }

  const annualBalance = balancesQuery.data?.find(
    (row) => row.leaveType === 'ANNUAL',
  );
  const balancesReady = Boolean(balancesQuery.data) && !balancesQuery.isFetching;
  const hasNoRecord =
    balancesReady && annualBalance?.hasRecord === false && !initialized.has(cycleKey);

  async function submit(): Promise<void> {
    if (!employeeId) {
      return;
    }
    try {
      const values = await form.validateFields();
      await snapshotMutation.mutateAsync({
        employeeId,
        // The leave-year label is unique per employee and maps to exactly one
        // contract leave year (exact start/end dates), so this writes to it.
        year: values.year,
        reason: values.reason.trim(),
        rows: values.rows.map((row) => ({
          leaveType: row.leaveType,
          entitled: Number(row.entitled ?? 0),
          broughtForward: Number(row.broughtForward ?? 0),
          used: Number(row.used ?? 0),
        })),
      });
      messageApi.success(t(`${KEY}.saved`));
      onClose();
    } catch (error: unknown) {
      // Ant Design validateFields rejects with a plain object ({ errorFields }).
      if (
        error &&
        typeof error === 'object' &&
        'errorFields' in error
      ) {
        return;
      }
      notifyApiError(error, t(`${KEY}.saveFailed`), messageApi, t);
    }
  }

  const employee = employeeSummary?.employee;

  const cycleItems = cycles.map((cycle) => {
    const contract = cycle.contract?.contractNumber ?? t(`${KEY}.noContract`);
    return {
      value: cycle.label,
      caption:
        cycle.label === currentLabel
          ? `${contract} · ${t(`${KEY}.currentCycle`)}`
          : contract,
      title: cycleRange(cycle),
    };
  });

  return (
    <Modal
      open={open}
      title={t(`${KEY}.setBalances`)}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      confirmLoading={snapshotMutation.isPending}
      okButtonProps={{ disabled: hasNoRecord || !selectedCycle }}
      width={720}
      onOk={submit}
      onCancel={onClose}
      destroyOnHidden
      rootClassName="erp-leave-bal-modal"
    >
      <Form<SnapshotFormValues> form={form} layout="vertical" requiredMark={false}>
        <Form.Item name="year" hidden rules={[{ required: true }]}>
          <InputNumber />
        </Form.Item>

        {/* Who. */}
        {employee ? (
          <div className="erp-lbm-head">
            <div className="erp-lbm-person">
              <EvaluationListAvatar
                firstName={employee.firstName}
                lastName={employee.lastName}
                userId={employee.id}
              />
              <div className="min-w-0">
                <p className="erp-lbm-name">{formatLeaveEmployeeName(employee)}</p>
                <p className="erp-lbm-meta">
                  {employee.employeeCode ? (
                    <span className="erp-lbm-chip">{employee.employeeCode}</span>
                  ) : null}
                  {employee.email ? (
                    <span className="erp-lbm-email">{employee.email}</span>
                  ) : null}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {/* Which leave year: one tab per contract leave year, exact dates. */}
        <div className="erp-lbm-period">
          <p className="erp-lbm-period-label">{t('hr.leave.contractPeriod')}</p>
          {leaveYearsQuery.isLoading ? (
            <Spin size="small" />
          ) : cycleItems.length === 0 ? (
            <p className="erp-lbm-period-empty">{t(`${KEY}.noCycles`)}</p>
          ) : cycleItems.length === 1 && cycleItems[0] ? (
            <div className="erp-lbm-period-static">
              <FileTextOutlined aria-hidden />
              <span className="erp-lbm-tab-caption">{cycleItems[0].caption}</span>
              <span className="erp-lbm-tab-title">{cycleItems[0].title}</span>
            </div>
          ) : (
            <PeriodTabs
              label={t(`${KEY}.cycleTabsLabel`)}
              items={cycleItems}
              value={year}
              onChange={selectCycle}
            />
          )}
        </div>

        <p className="erp-lbm-hint">{t(`${KEY}.snapshotHint`)}</p>

        <Spin spinning={balancesQuery.isFetching || leaveYearsQuery.isFetching}>
          {hasNoRecord ? (
            <div className="erp-lbm-empty" role="status">
              <p className="erp-lbm-empty-title">{t(`${KEY}.noRecordTitle`)}</p>
              <p className="erp-lbm-empty-hint">{t(`${KEY}.noRecordHint`)}</p>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() =>
                  setInitialized((previous) => new Set(previous).add(cycleKey))
                }
              >
                {t(`${KEY}.initialize`)}
              </Button>
            </div>
          ) : null}

          <Form.List name="rows">
            {(fields) => (
              <div className="erp-lbm-cards" hidden={hasNoRecord}>
                {fields.map((field, index) => {
                  const row = watchedRows?.[index];
                  const leaveType = (row?.leaveType ??
                    leaveTypes[index]!) as LeaveType;
                  const pending =
                    existingBalance(
                      leaveType,
                      year,
                      balancesQuery.data,
                      employeeSummary,
                    )?.pending ?? 0;
                  const remaining = remainingOf({
                    entitled: row?.entitled,
                    broughtForward: row?.broughtForward,
                    used: row?.used,
                    pending,
                  });
                  const typeLabel = formatLeaveType(leaveType, t);
                  return (
                    <section
                      key={field.key}
                      className="erp-lbm-card"
                      aria-label={typeLabel}
                    >
                      <header className="erp-lbm-card-head">
                        <span
                          className={`erp-lbm-type-icon erp-lbm-type-icon--${leaveType.toLowerCase()}`}
                          aria-hidden
                        >
                          <CalendarOutlined />
                        </span>
                        <h3 className="erp-lbm-card-title">{typeLabel}</h3>
                        <div
                          className={`erp-lbm-remaining${
                            remaining < 0 ? ' erp-lbm-remaining--negative' : ''
                          }`}
                        >
                          <span className="erp-lbm-remaining-label">
                            {t('hr.labels.remaining')}
                          </span>
                          <span className="erp-lbm-remaining-value">{remaining}</span>
                        </div>
                      </header>

                      <Form.Item name={[field.name, 'leaveType']} hidden>
                        <Input />
                      </Form.Item>

                      <div className="erp-lbm-fields">
                        <Form.Item
                          name={[field.name, 'entitled']}
                          label={t('hr.labels.entitled')}
                          rules={[{ required: true }]}
                        >
                          <InputNumber {...DAY_INPUT} />
                        </Form.Item>

                        <Form.Item
                          name={[field.name, 'broughtForward']}
                          label={t('hr.labels.broughtForward')}
                          rules={[{ required: true }]}
                        >
                          <InputNumber {...DAY_INPUT} />
                        </Form.Item>

                        <Form.Item
                          name={[field.name, 'used']}
                          label={t('hr.labels.used')}
                          rules={[{ required: true }]}
                        >
                          <InputNumber {...DAY_INPUT} />
                        </Form.Item>

                        <div className="erp-lbm-static">
                          <span className="erp-lbm-static-label">
                            {t('hr.labels.pending')}
                          </span>
                          <span className="erp-lbm-static-value">{pending}</span>
                        </div>
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </Form.List>
        </Spin>

        <p className="erp-lbm-formula">
          <InfoCircleOutlined aria-hidden />
          {t(`${KEY}.remainingFormula`)}
        </p>

        <Form.Item
          name="reason"
          label={t(`${KEY}.reason`)}
          className="erp-lbm-reason"
          rules={[
            { required: true, whitespace: true, message: t(`${KEY}.reasonRequired`) },
            { min: 3, message: t(`${KEY}.reasonRequired`) },
          ]}
        >
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} maxLength={1000} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}
