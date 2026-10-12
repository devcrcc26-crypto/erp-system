'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Form, Input, InputNumber, Modal, Select, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { History } from 'lucide-react';
import DataTable from '@/components/ui/DataTable/DataTable';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  LeaveBalanceEntry,
  LeaveBalanceEntryKind,
  LeaveType,
} from '@/lib/api/leave.types';
import {
  useAdjustLeaveBalance,
  useLeaveBalanceLedger,
  useSetOpeningLeaveBalance,
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

type ModalKind = 'adjust' | 'opening';

interface EntryFormValues {
  leaveType: LeaveType;
  days: number;
  reason: string;
}

function signed(days: number): string {
  return days > 0 ? `+${days}` : String(days);
}

/**
 * Leave balance history (every ledger entry with who / when / why) and, for
 * HR editors on an employee profile, "Adjust balance" / "Set opening balance".
 * Entries are never edited — corrections are new entries.
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
  const [form] = Form.useForm<EntryFormValues>();
  const [modal, setModal] = useState<ModalKind | null>(null);
  const [page, setPage] = useState(1);
  const ledgerQuery = useLeaveBalanceLedger(employeeId);
  const adjustMutation = useAdjustLeaveBalance();
  const openingMutation = useSetOpeningLeaveBalance();
  const saving = adjustMutation.isPending || openingMutation.isPending;

  const entries = ledgerQuery.data?.entries ?? [];
  const current = ledgerQuery.data?.currentLeaveYear;

  function open(kind: ModalKind): void {
    form.setFieldsValue({
      leaveType: 'ANNUAL',
      days: kind === 'opening' ? 0 : 0.5,
      reason: '',
    });
    setModal(kind);
  }

  async function submit(): Promise<void> {
    if (!employeeId || !modal) {
      return;
    }
    const values = await form.validateFields();
    const payload = {
      employeeId,
      leaveType: values.leaveType,
      days: values.days,
      reason: values.reason.trim(),
    };
    try {
      if (modal === 'adjust') {
        await adjustMutation.mutateAsync(payload);
      } else {
        await openingMutation.mutateAsync(payload);
      }
      messageApi.success(t(`${KEY}.saved`));
      setModal(null);
    } catch (error: unknown) {
      notifyApiError(error, t(`${KEY}.saveFailed`), messageApi, t);
    }
  }

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
            <Button size="small" onClick={() => open('opening')}>
              {t(`${KEY}.setOpening`)}
            </Button>
            <Button type="primary" size="small" onClick={() => open('adjust')}>
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
        open={modal != null}
        title={modal === 'opening' ? t(`${KEY}.setOpening`) : t(`${KEY}.adjust`)}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        confirmLoading={saving}
        onOk={() => void submit()}
        onCancel={() => setModal(null)}
        destroyOnHidden
      >
        <p className="m-0 mb-3 text-sm text-slate-700">
          {modal === 'opening' ? t(`${KEY}.openingHint`) : t(`${KEY}.adjustHint`)}
        </p>
        <Form<EntryFormValues> form={form} layout="vertical" requiredMark={false}>
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
            extra={modal === 'adjust' ? t(`${KEY}.daysHint`) : undefined}
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
                  if (modal === 'adjust' && value === 0) {
                    return Promise.reject(new Error(t(`${KEY}.nonZero`)));
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <InputNumber
              className="w-full"
              step={0.5}
              min={modal === 'opening' ? 0 : -365}
              max={365}
              precision={1}
            />
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
    </div>
  );
}
