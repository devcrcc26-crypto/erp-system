'use client';

import { useEffect, useMemo } from 'react';
import { Form, Input, InputNumber, Modal, Select } from 'antd';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAppMessage } from '@/hooks/use-app-message';
import type {
  EmployeeLeaveBalanceSummary,
  LeaveBalance,
  LeaveType,
} from '@/lib/api/leave.types';
import { useMyLeaveBalances, useSetLeaveBalanceSnapshot } from '@/lib/query/leave';
import { leaveBalanceTypesForGender } from '@/lib/utils/leave-balance-access';
import { formatLeaveType } from '@/lib/utils/leave-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';

const KEY = 'hr.leave.ledger';

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

function remainingOf(row: {
  entitled?: number | null;
  broughtForward?: number | null;
  used?: number | null;
}): number {
  const entitled = Number(row.entitled ?? 0);
  const broughtForward = Number(row.broughtForward ?? 0);
  const used = Number(row.used ?? 0);
  return Math.round((entitled + broughtForward - used) * 10) / 10;
}

function rowsFromBalances(
  leaveTypes: LeaveType[],
  balances: LeaveBalance[] | undefined,
  summary: EmployeeLeaveBalanceSummary | null,
): SnapshotRowValues[] {
  return leaveTypes.map((leaveType) => {
    const fromList =
      leaveType === 'ANNUAL'
        ? summary?.annual
        : leaveType === 'SICK'
          ? summary?.sick
          : summary?.maternity;
    const existing =
      fromList ?? balances?.find((row) => row.leaveType === leaveType);
    return {
      leaveType,
      entitled: existing?.entitled ?? 0,
      broughtForward: leaveType === 'ANNUAL' ? (existing?.broughtForward ?? 0) : 0,
      used: existing?.used ?? 0,
    };
  });
}

/**
 * HR / GM / System Admin modal to set entitled, brought-forward (annual only),
 * and used for an employee's leave year. Remaining is calculated.
 */
export default function LeaveBalanceEditModal({
  open,
  employeeSummary,
  defaultYear,
  leaveYearHint,
  onClose,
}: {
  open: boolean;
  employeeSummary: EmployeeLeaveBalanceSummary | null;
  defaultYear: number;
  leaveYearHint?: { start: string; end: string } | null;
  onClose: () => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<SnapshotFormValues>();
  const employeeId = employeeSummary?.employeeId;
  const gender = employeeSummary?.employee.gender;
  const leaveTypes = useMemo(
    () => leaveBalanceTypesForGender(gender),
    [gender],
  );
  const year = Form.useWatch('year', form) ?? defaultYear;
  const balancesQuery = useMyLeaveBalances({
    year,
    employeeId,
    enabled: open && Boolean(employeeId),
  });
  const snapshotMutation = useSetLeaveBalanceSnapshot();
  const watchedRows = Form.useWatch('rows', form);

  // Seed year + reason when the modal opens for an employee.
  useEffect(() => {
    if (!open || !employeeSummary) {
      return;
    }
    form.setFieldsValue({
      year: defaultYear,
      reason: '',
      rows: rowsFromBalances(leaveTypes, undefined, employeeSummary),
    });
  }, [open, employeeSummary?.employeeId, defaultYear, leaveTypes, form]);

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
          broughtForward:
            row.leaveType === 'ANNUAL' ? Number(row.broughtForward ?? 0) : 0,
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

  const yearOptions = [defaultYear - 1, defaultYear, defaultYear + 1].map(
    (value) => ({ value, label: String(value) }),
  );

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
    >
      <p className="m-0 mb-3 text-sm text-slate-700">{t(`${KEY}.snapshotHint`)}</p>
      {employeeSummary ? (
        <p className="m-0 mb-3 text-sm font-medium text-slate-900">
          {employeeSummary.employee.firstName}{' '}
          {employeeSummary.employee.lastName}
          {employeeSummary.employee.email
            ? ` · ${employeeSummary.employee.email}`
            : ''}
        </p>
      ) : null}
      <Form<SnapshotFormValues> form={form} layout="vertical" requiredMark={false}>
        <Form.Item
          name="year"
          label={t(`${KEY}.leaveYearLabel`)}
          extra={
            leaveYearHint
              ? t(`${KEY}.leaveYearExtra`, {
                  start: formatProjectDate(leaveYearHint.start),
                  end: formatProjectDate(leaveYearHint.end),
                })
              : undefined
          }
          rules={[{ required: true }]}
        >
          <Select options={yearOptions} />
        </Form.Item>

        <Form.List name="rows">
          {(fields) => (
            <div className="mb-4 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
                    <th className="px-3 py-2 font-semibold">
                      {t('hr.table.leaveType')}
                    </th>
                    <th className="px-3 py-2 font-semibold">
                      {t('hr.labels.entitled')}
                    </th>
                    <th className="px-3 py-2 font-semibold">
                      {t('hr.labels.broughtForward')}
                    </th>
                    <th className="px-3 py-2 font-semibold">
                      {t('hr.labels.used')}
                    </th>
                    <th className="px-3 py-2 font-semibold">
                      {t('hr.labels.remaining')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((field, index) => {
                    const row = watchedRows?.[index];
                    const leaveType = (row?.leaveType ??
                      leaveTypes[index]!) as LeaveType;
                    const isAnnual = leaveType === 'ANNUAL';
                    const remaining = remainingOf({
                      entitled: row?.entitled,
                      broughtForward: isAnnual ? row?.broughtForward : 0,
                      used: row?.used,
                    });
                    return (
                      <tr key={field.key} className="border-t border-slate-100">
                        <td className="px-3 py-2">
                          <Form.Item name={[field.name, 'leaveType']} hidden>
                            <Input />
                          </Form.Item>
                          {formatLeaveType(leaveType, t)}
                        </td>
                        <td className="px-3 py-2">
                          <Form.Item
                            name={[field.name, 'entitled']}
                            className="mb-0"
                            rules={[{ required: true }]}
                          >
                            <InputNumber
                              className="w-full"
                              min={0}
                              max={365}
                              step={0.5}
                              precision={1}
                            />
                          </Form.Item>
                        </td>
                        <td className="px-3 py-2">
                          {isAnnual ? (
                            <Form.Item
                              name={[field.name, 'broughtForward']}
                              className="mb-0"
                              rules={[{ required: true }]}
                            >
                              <InputNumber
                                className="w-full"
                                min={0}
                                max={365}
                                step={0.5}
                                precision={1}
                              />
                            </Form.Item>
                          ) : (
                            <>
                              <Form.Item
                                name={[field.name, 'broughtForward']}
                                hidden
                                initialValue={0}
                              >
                                <InputNumber />
                              </Form.Item>
                              <span className="erp-users-cell-sub">-</span>
                            </>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Form.Item
                            name={[field.name, 'used']}
                            className="mb-0"
                            rules={[{ required: true }]}
                          >
                            <InputNumber
                              className="w-full"
                              min={0}
                              max={365}
                              step={0.5}
                              precision={1}
                            />
                          </Form.Item>
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`tabular-nums font-semibold ${
                              remaining < 0 ? 'text-red-700' : 'text-slate-900'
                            }`}
                          >
                            {remaining}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="m-0 border-t border-slate-100 px-3 py-2 text-xs text-slate-600">
                {t(`${KEY}.remainingFormula`)}
                {' · '}
                {t(`${KEY}.broughtForwardAnnualOnly`)}
              </p>
            </div>
          )}
        </Form.List>

        <Form.Item
          name="reason"
          label={t(`${KEY}.reason`)}
          rules={[
            { required: true, whitespace: true, message: t(`${KEY}.reasonRequired`) },
            { min: 3, message: t(`${KEY}.reasonRequired`) },
          ]}
        >
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} maxLength={1000} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
