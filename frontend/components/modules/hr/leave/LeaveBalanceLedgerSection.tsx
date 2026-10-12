'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Tag,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { History } from 'lucide-react';
import DataTable from '@/components/ui/DataTable/DataTable';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  LeaveBalance,
  LeaveBalanceEntry,
  LeaveBalanceEntryKind,
  LeaveType,
} from '@/lib/api/leave.types';
import {
  useAdjustLeaveBalance,
  useLeaveBalanceLedger,
  useMyLeaveBalances,
  useSetLeaveBalanceSnapshot,
} from '@/lib/query/leave';
import { OWN_BALANCE_LEAVE_TYPES, formatLeaveType } from '@/lib/utils/leave-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';

const KEY = 'hr.leave.ledger';
const PAGE_SIZE = 10;

const KIND_COLORS: Record<LeaveBalanceEntryKind, string> = {
  ENTITLEMENT: 'green',
  CARRY_OVER: 'blue',
  ADJUSTMENT: 'purple',
  OPENING_BALANCE: 'cyan',
  USED: 'orange',
  EXPIRED: 'default',
};

type ModalKind = 'adjust' | 'snapshot';

interface AdjustFormValues {
  leaveType: LeaveType;
  days: number;
  reason: string;
}

interface SnapshotRowValues {
  leaveType: LeaveType;
  entitled: number;
  broughtForward: number;
  used: number;
}

interface SnapshotFormValues {
  year?: number;
  reason: string;
  rows: SnapshotRowValues[];
}

function signed(days: number): string {
  return days > 0 ? `+${days}` : String(days);
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

function emptySnapshotRows(
  balances: LeaveBalance[] | undefined,
): SnapshotRowValues[] {
  return OWN_BALANCE_LEAVE_TYPES.map((leaveType) => {
    const existing = balances?.find((row) => row.leaveType === leaveType);
    return {
      leaveType,
      entitled: existing?.entitled ?? 0,
      broughtForward: existing?.broughtForward ?? 0,
      used: existing?.used ?? 0,
    };
  });
}

/**
 * Leave balance history and HR editors: adjust (±days) or set balances
 * (entitled / brought forward / used → remaining calculated).
 */
export default function LeaveBalanceLedgerSection({
  employeeId,
  canEdit,
}: {
  /** Undefined = the signed-in user. */
  employeeId?: string;
  canEdit: boolean;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const [adjustForm] = Form.useForm<AdjustFormValues>();
  const [snapshotForm] = Form.useForm<SnapshotFormValues>();
  const [modal, setModal] = useState<ModalKind | null>(null);
  const [page, setPage] = useState(1);
  const ledgerQuery = useLeaveBalanceLedger(employeeId);
  const current = ledgerQuery.data?.currentLeaveYear;
  const snapshotYear =
    Form.useWatch('year', snapshotForm) ?? current?.label ?? new Date().getFullYear();
  const balancesQuery = useMyLeaveBalances(
    { year: snapshotYear, employeeId, enabled: modal === 'snapshot' && Boolean(employeeId) },
  );
  const adjustMutation = useAdjustLeaveBalance();
  const snapshotMutation = useSetLeaveBalanceSnapshot();
  const saving = adjustMutation.isPending || snapshotMutation.isPending;

  const entries = ledgerQuery.data?.entries ?? [];
  const watchedRows = Form.useWatch('rows', snapshotForm);

  useEffect(() => {
    if (modal !== 'snapshot' || !balancesQuery.data) {
      return;
    }
    snapshotForm.setFieldsValue({
      rows: emptySnapshotRows(balancesQuery.data),
    });
  }, [modal, balancesQuery.data, snapshotForm]);

  function openAdjust(): void {
    adjustForm.setFieldsValue({
      leaveType: 'ANNUAL',
      days: 0.5,
      reason: '',
    });
    setModal('adjust');
  }

  function openSnapshot(): void {
    snapshotForm.setFieldsValue({
      year: current?.label,
      reason: '',
      rows: emptySnapshotRows(balancesQuery.data),
    });
    setModal('snapshot');
  }

  async function submitAdjust(): Promise<void> {
    if (!employeeId) {
      return;
    }
    const values = await adjustForm.validateFields();
    try {
      await adjustMutation.mutateAsync({
        employeeId,
        leaveType: values.leaveType,
        days: values.days,
        reason: values.reason.trim(),
      });
      messageApi.success(t(`${KEY}.saved`));
      setModal(null);
    } catch (error: unknown) {
      notifyApiError(error, t(`${KEY}.saveFailed`), messageApi, t);
    }
  }

  async function submitSnapshot(): Promise<void> {
    if (!employeeId) {
      return;
    }
    const values = await snapshotForm.validateFields();
    try {
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
      setModal(null);
    } catch (error: unknown) {
      notifyApiError(error, t(`${KEY}.saveFailed`), messageApi, t);
    }
  }

  const yearOptions = useMemo(() => {
    const label = current?.label ?? new Date().getFullYear();
    return [label - 1, label, label + 1].map((year) => ({
      value: year,
      label: String(year),
    }));
  }, [current?.label]);

  const columns: ColumnsType<LeaveBalanceEntry> = useMemo(
    () => [
      {
        title: t(`${KEY}.colWhen`),
        dataIndex: 'createdAt',
        key: 'createdAt',
        width: 120,
        render: (value: string) => formatProjectDate(value),
      },
      {
        title: t(`${KEY}.colLeaveYear`),
        key: 'leaveYear',
        width: 190,
        responsive: ['md'],
        render: (_: unknown, row) =>
          `${formatProjectDate(row.leaveYearStart)} – ${formatProjectDate(row.leaveYearEnd)}`,
      },
      {
        title: t('hr.table.leaveType'),
        dataIndex: 'leaveType',
        key: 'leaveType',
        width: 110,
        render: (value: LeaveType) => formatLeaveType(value, t),
      },
      {
        title: t(`${KEY}.colKind`),
        dataIndex: 'kind',
        key: 'kind',
        width: 140,
        render: (value: LeaveBalanceEntryKind) => (
          <Tag color={KIND_COLORS[value]} className="m-0 rounded-full">
            {t(`${KEY}.kinds.${value}`)}
          </Tag>
        ),
      },
      {
        title: t(`${KEY}.colDays`),
        dataIndex: 'days',
        key: 'days',
        width: 80,
        align: 'right',
        render: (value: number) => (
          <span
            className={`tabular-nums font-semibold ${
              value < 0 ? 'text-red-700' : 'text-emerald-700'
            }`}
          >
            {signed(value)}
          </span>
        ),
      },
      {
        title: t(`${KEY}.colReason`),
        dataIndex: 'reason',
        key: 'reason',
        render: (value: string | null) => value ?? '—',
      },
      {
        title: t(`${KEY}.colBy`),
        key: 'by',
        width: 150,
        responsive: ['md'],
        render: (_: unknown, row) => row.createdBy?.name ?? t(`${KEY}.system`),
      },
    ],
    [t],
  );

  return (
    <div className="erp-employee-section">
      <div className="erp-employee-section-header">
        <div className="min-w-0">
          <h3 className="erp-employee-section-title">{t(`${KEY}.title`)}</h3>
          {current ? (
            <p className="m-0 mt-0.5 text-xs text-slate-600">
              {t(`${KEY}.currentLeaveYear`, {
                start: formatProjectDate(current.start),
                end: formatProjectDate(current.end),
              })}
            </p>
          ) : null}
        </div>
        {canEdit && employeeId ? (
          <div className="erp-employee-section-extra flex flex-wrap gap-2">
            <Button size="small" onClick={openSnapshot}>
              {t(`${KEY}.setBalances`)}
            </Button>
            <Button type="primary" size="small" onClick={openAdjust}>
              {t(`${KEY}.adjust`)}
            </Button>
          </div>
        ) : null}
      </div>
      <div className="erp-employee-section-body !p-0">
        {ledgerQuery.isError ? (
          <div className="p-4">
            <Alert type="error" showIcon title={t(`${KEY}.loadFailed`)} />
          </div>
        ) : (
          <DataTable<LeaveBalanceEntry>
            rowKey="id"
            size="small"
            className="erp-pro-table erp-users-table"
            loading={ledgerQuery.isLoading}
            columns={columns}
            dataSource={entries}
            pagination={{
              current: page,
              pageSize: PAGE_SIZE,
              total: entries.length,
              showSizeChanger: false,
              hideOnSinglePage: true,
              onChange: setPage,
            }}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<History size={28} strokeWidth={1.5} />}
                  title={t(`${KEY}.empty`)}
                />
              ),
            }}
          />
        )}
      </div>

      <Modal
        open={modal === 'adjust'}
        title={t(`${KEY}.adjust`)}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        confirmLoading={saving}
        onOk={() => void submitAdjust()}
        onCancel={() => setModal(null)}
        destroyOnHidden
      >
        <p className="m-0 mb-3 text-sm text-slate-700">{t(`${KEY}.adjustHint`)}</p>
        <Form<AdjustFormValues> form={adjustForm} layout="vertical" requiredMark={false}>
          <Form.Item
            name="leaveType"
            label={t('hr.table.leaveType')}
            rules={[{ required: true }]}
          >
            <Select
              options={OWN_BALANCE_LEAVE_TYPES.map((value) => ({
                value,
                label: formatLeaveType(value, t),
              }))}
            />
          </Form.Item>
          <Form.Item
            name="days"
            label={t(`${KEY}.days`)}
            extra={t(`${KEY}.daysHint`)}
            rules={[
              { required: true, message: t(`${KEY}.daysRequired`) },
              {
                validator: (_, value: number | null) => {
                  if (value == null) {
                    return Promise.resolve();
                  }
                  if (Math.round(value * 2) !== value * 2) {
                    return Promise.reject(new Error(t(`${KEY}.halfSteps`)));
                  }
                  if (value === 0) {
                    return Promise.reject(new Error(t(`${KEY}.nonZero`)));
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <InputNumber className="w-full" step={0.5} min={-365} max={365} precision={1} />
          </Form.Item>
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

      <Modal
        open={modal === 'snapshot'}
        title={t(`${KEY}.setBalances`)}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        confirmLoading={saving}
        width={720}
        onOk={() => void submitSnapshot()}
        onCancel={() => setModal(null)}
        destroyOnHidden
      >
        <p className="m-0 mb-3 text-sm text-slate-700">{t(`${KEY}.snapshotHint`)}</p>
        <Form<SnapshotFormValues>
          form={snapshotForm}
          layout="vertical"
          requiredMark={false}
          initialValues={{
            year: current?.label,
            rows: emptySnapshotRows(undefined),
          }}
        >
          <Form.Item
            name="year"
            label={t(`${KEY}.leaveYearLabel`)}
            extra={
              current
                ? t(`${KEY}.leaveYearExtra`, {
                    start: formatProjectDate(current.start),
                    end: formatProjectDate(current.end),
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
                      <th className="px-3 py-2 font-semibold">{t('hr.labels.entitled')}</th>
                      <th className="px-3 py-2 font-semibold">
                        {t('hr.labels.broughtForward')}
                      </th>
                      <th className="px-3 py-2 font-semibold">{t('hr.labels.used')}</th>
                      <th className="px-3 py-2 font-semibold">
                        {t('hr.labels.remaining')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((field, index) => {
                      const row = watchedRows?.[index];
                      const remaining = remainingOf(row ?? {});
                      return (
                        <tr key={field.key} className="border-t border-slate-100">
                          <td className="px-3 py-2">
                            <Form.Item name={[field.name, 'leaveType']} hidden>
                              <Input />
                            </Form.Item>
                            {formatLeaveType(
                              (row?.leaveType ??
                                OWN_BALANCE_LEAVE_TYPES[index]!) as LeaveType,
                              t,
                            )}
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
    </div>
  );
}
