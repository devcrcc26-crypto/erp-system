'use client';

import { useEffect, useMemo } from 'react';
import { Form, Input, InputNumber, Modal, Select, Spin } from 'antd';
import { CalendarOutlined, InfoCircleOutlined } from '@ant-design/icons';
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
 * The current balance for a type, if one exists. When the employee has no
 * annual record yet, the form starts at zero and saving creates it.
 */
function existingBalance(
  leaveType: LeaveType,
  balances: LeaveBalance[] | undefined,
  summary: EmployeeLeaveBalanceSummary | null,
): LeaveBalance | null | undefined {
  const fromList = leaveType === 'ANNUAL' ? summary?.annual : undefined;
  return fromList ?? balances?.find((row) => row.leaveType === leaveType);
}

function rowsFromBalances(
  leaveTypes: LeaveType[],
  balances: LeaveBalance[] | undefined,
  summary: EmployeeLeaveBalanceSummary | null,
): SnapshotRowValues[] {
  return leaveTypes.map((leaveType) => {
    const existing = existingBalance(leaveType, balances, summary);
    return {
      leaveType,
      entitled: existing?.entitled ?? 0,
      broughtForward: existing?.broughtForward ?? 0,
      used: existing?.used ?? 0,
    };
  });
}

/** `Contract #1 · Jun 5, 2026 – Present` (or cycle dates when no contract). */
function formatContractOptionLabel(
  option: LeaveYearOption,
  allYears: LeaveYearOption[],
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (option.contract) {
    const end = option.contract.endDate
      ? formatProjectDate(option.contract.endDate)
      : t(`${KEY}.contractPresent`);
    const base = t(`${KEY}.contractOption`, {
      n: option.contract.sequence,
      start: formatProjectDate(option.contract.startDate),
      end,
    });
    // Same contract can cover several anniversary leave years — disambiguate.
    const sameContract = allYears.filter(
      (row) => row.contract?.id === option.contract?.id,
    ).length;
    if (sameContract > 1) {
      return t(`${KEY}.contractOptionWithCycle`, {
        label: base,
        start: formatProjectDate(option.start),
        end: formatProjectDate(option.end),
      });
    }
    return base;
  }
  return t(`${KEY}.cycleOnlyOption`, {
    start: formatProjectDate(option.start),
    end: formatProjectDate(option.end),
  });
}

const DAY_INPUT = {
  className: 'w-full',
  min: 0,
  max: 365,
  step: 0.5,
  precision: 1,
} as const;

/**
 * HR / GM / System Admin modal to set annual leave entitlement, brought
 * forward and used for an employee's leave year. Remaining (incl. pending)
 * updates as you type. The year is selected via its owning contract label.
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

  const contractOptions = useMemo(() => {
    const years = leaveYearsQuery.data?.years ?? [];
    return years.map((option) => ({
      value: option.label,
      label: formatContractOptionLabel(option, years, t),
    }));
  }, [leaveYearsQuery.data?.years, t]);

  const selectedYearOption = useMemo(() => {
    const years = leaveYearsQuery.data?.years ?? [];
    return years.find((option) => option.label === year) ?? null;
  }, [leaveYearsQuery.data?.years, year]);

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
      rows: rowsFromBalances(leaveTypes, undefined, employeeSummary),
    });
  }, [
    open,
    employeeSummary?.employeeId,
    defaultYear,
    leaveTypes,
    form,
    leaveYearsQuery.data,
  ]);

  // Refresh row values when balances for the selected year load.
  useEffect(() => {
    if (!open || !employeeSummary || !balancesQuery.data) {
      return;
    }
    form.setFieldsValue({
      rows: rowsFromBalances(
        leaveTypes,
        balancesQuery.data,
        employeeSummary,
      ),
    });
  }, [open, employeeSummary, leaveTypes, balancesQuery.data, form]);

  async function submit(): Promise<void> {
    if (!employeeId) {
      return;
    }
    try {
      const values = await form.validateFields();
      await snapshotMutation.mutateAsync({
        employeeId,
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

  return (
    <Modal
      open={open}
      title={t(`${KEY}.setBalances`)}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      confirmLoading={snapshotMutation.isPending}
      width={720}
      onOk={submit}
      onCancel={onClose}
      destroyOnHidden
      rootClassName="erp-leave-bal-modal"
    >
      <Form<SnapshotFormValues> form={form} layout="vertical" requiredMark={false}>
        {/* Who, and which contract / leave cycle. */}
        <div className="erp-lbm-head">
          {employee ? (
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
          ) : null}
          <Form.Item
            name="year"
            label={t(`${KEY}.contractLabel`)}
            className="erp-lbm-year"
            rules={[{ required: true }]}
          >
            <Select
              options={contractOptions}
              loading={leaveYearsQuery.isLoading}
              placeholder={t(`${KEY}.contractPlaceholder`)}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
        </div>

        <p className="erp-lbm-hint">
          {t(`${KEY}.snapshotHint`)}
          {selectedYearOption ? (
            <>
              {' '}
              {t(`${KEY}.leaveYearExtra`, {
                start: formatProjectDate(selectedYearOption.start),
                end: formatProjectDate(selectedYearOption.end),
              })}
            </>
          ) : null}
        </p>

        <Spin spinning={balancesQuery.isFetching || leaveYearsQuery.isFetching}>
          <Form.List name="rows">
            {(fields) => (
              <div className="erp-lbm-cards">
                {fields.map((field, index) => {
                  const row = watchedRows?.[index];
                  const leaveType = (row?.leaveType ??
                    leaveTypes[index]!) as LeaveType;
                  const pending =
                    existingBalance(leaveType, balancesQuery.data, employeeSummary)
                      ?.pending ?? 0;
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
