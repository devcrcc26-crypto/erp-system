'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Form,
  Input,
  Modal,
  Spin,
  Tag,
} from 'antd';
import { DollarOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/ui/DataTable/DataTable';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  useCanAccessPayroll,
  useCanCreatePayroll,
} from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type { PayrollRunListItem } from '@/lib/api/payroll.types';
import { useCreatePayrollRun, usePayrollRuns } from '@/lib/query/payroll';
import {
  formatPayrollMoney,
  formatPayrollPeriod,
  payrollStatusLabelKey,
  payrollStatusTagStyle,
  PAYROLL_MONEY_CELL_STYLE,
} from '@/lib/utils/payroll-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';

function PayrollStat({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactNode {
  return (
    <div className="erp-users-stat erp-contract-stat min-w-[140px]">
      <div className="min-w-0 text-left">
        <p className="erp-users-stat-label">{label}</p>
        <p className="erp-users-stat-value text-base">{value}</p>
      </div>
    </div>
  );
}

export default function PayrollRunsListPageContent(): React.ReactNode {
  const router = useRouter();
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const canAccess = useCanAccessPayroll();
  const canCreate = useCanCreatePayroll();
  const listQuery = usePayrollRuns(canAccess);
  const createMutation = useCreatePayrollRun();

  const [createOpen, setCreateOpen] = useState(false);
  const [period, setPeriod] = useState<Dayjs | null>(null);
  const [notes, setNotes] = useState('');

  const rows = listQuery.data ?? [];

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const stats = useMemo(() => {
    const currentRun = rows.find(
      (r) => r.month === currentMonth && r.year === currentYear && r.status !== 'CANCELLED',
    );
    const lastPaid = rows.find((r) => r.status === 'PAID');
    return {
      totalRuns: rows.filter((r) => r.status !== 'CANCELLED').length,
      currentStatus: currentRun
        ? t(payrollStatusLabelKey(currentRun.status))
        : t('hr.payroll.list.noCurrentRun'),
      lastPaidNet: lastPaid
        ? formatPayrollMoney(lastPaid.totalNetPay, { emptyZero: false })
        : '—',
    };
  }, [rows, currentMonth, currentYear, t]);

  const columns: ColumnsType<PayrollRunListItem> = useMemo(
    () => [
      {
        title: t('hr.payroll.list.runNumber'),
        dataIndex: 'runNumber',
        width: 120,
        render: (value: string) => (
          <span style={{ fontWeight: 600 }}>{value}</span>
        ),
      },
      {
        title: t('hr.payroll.list.period'),
        key: 'period',
        width: 160,
        render: (_, row) => formatPayrollPeriod(row.month, row.year),
      },
      {
        title: t('hr.payroll.list.status'),
        dataIndex: 'status',
        width: 130,
        render: (status: PayrollRunListItem['status']) => (
          <Tag
            bordered={false}
            style={{
              margin: 0,
              borderRadius: 999,
              fontWeight: 500,
              fontSize: 11,
              ...payrollStatusTagStyle(status),
            }}
          >
            {t(payrollStatusLabelKey(status))}
          </Tag>
        ),
      },
      {
        title: t('hr.payroll.list.employees'),
        key: 'employees',
        width: 100,
        align: 'right',
        render: (_, row) => row._count.entries,
      },
      {
        title: t('hr.payroll.list.totalGross'),
        dataIndex: 'totalGross',
        align: 'right',
        render: (v) => (
          <span style={PAYROLL_MONEY_CELL_STYLE}>
            {formatPayrollMoney(v, { emptyZero: false })}
          </span>
        ),
      },
      {
        title: t('hr.payroll.list.totalTax'),
        dataIndex: 'totalTax',
        align: 'right',
        render: (v) => (
          <span style={PAYROLL_MONEY_CELL_STYLE}>
            {formatPayrollMoney(v, { emptyZero: false })}
          </span>
        ),
      },
      {
        title: t('hr.payroll.list.totalNet'),
        dataIndex: 'totalNetPay',
        align: 'right',
        render: (v) => (
          <span style={{ ...PAYROLL_MONEY_CELL_STYLE, fontWeight: 600 }}>
            {formatPayrollMoney(v, { emptyZero: false })}
          </span>
        ),
      },
      {
        title: t('hr.payroll.list.flagged'),
        dataIndex: 'flaggedCount',
        width: 90,
        align: 'right',
        render: (count: number) =>
          count > 0 ? (
            <span style={{ color: 'var(--color-amber-600)', fontWeight: 600 }}>
              {count}
            </span>
          ) : (
            '—'
          ),
      },
      {
        title: t('hr.payroll.list.created'),
        dataIndex: 'createdAt',
        width: 110,
        render: (value: string) => dayjs(value).format('YYYY-MM-DD'),
      },
    ],
    [t],
  );

  async function handleCreateRun(): Promise<void> {
    if (!period) {
      messageApi.warning(t('hr.payroll.create.selectPeriodRequired'));
      return;
    }
    try {
      const run = await createMutation.mutateAsync({
        month: period.month() + 1,
        year: period.year(),
        notes: notes.trim() || undefined,
      });
      messageApi.success(t('hr.payroll.create.success'));
      setCreateOpen(false);
      setPeriod(null);
      setNotes('');
      router.push(`/hr/payroll/${run.id}`);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        messageApi.error(error.message);
      } else {
        notifyApiError(error, 'Request failed', messageApi);
      }
    }
  }

  if (!canAccess) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-payroll-page">
        <Alert type="warning" showIcon title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-payroll-page">
        <div className="flex justify-center rounded-xl border border-[#e8ebef] bg-white p-12">
          <Spin />
        </div>
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-payroll-page">
      <Modal
        title={t('hr.payroll.create.title')}
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false);
          setPeriod(null);
          setNotes('');
        }}
        onOk={() => void handleCreateRun()}
        okText={t('hr.payroll.create.submit')}
        confirmLoading={createMutation.isPending}
        destroyOnHidden
      >
        <Form layout="vertical" className="mt-2">
          <Form.Item label={t('hr.payroll.create.period')} required>
            <DatePicker
              picker="month"
              value={period}
              onChange={(value) => setPeriod(value)}
              disabledDate={(current) =>
                current != null && current.endOf('month').isAfter(dayjs().endOf('month'))
              }
              className="w-full"
              placeholder={t('hr.payroll.create.periodPlaceholder')}
            />
          </Form.Item>
          <Form.Item label={t('hr.payroll.create.notes')}>
            <Input.TextArea
              rows={3}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Form.Item>
        </Form>
      </Modal>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <PayrollStat
            label={t('hr.payroll.list.statTotalRuns')}
            value={String(stats.totalRuns)}
          />
          <PayrollStat
            label={t('hr.payroll.list.statCurrentMonth')}
            value={stats.currentStatus}
          />
          <PayrollStat
            label={t('hr.payroll.list.statLastPaidNet')}
            value={`${stats.lastPaidNet} ETB`}
          />
        </div>
        {canCreate ? (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
          >
            {t('hr.payroll.list.newRun')}
          </Button>
        ) : null}
      </div>

      <DataTable<PayrollRunListItem>
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={listQuery.isFetching}
        pagination={false}
        onRow={(record) => ({
          onClick: () => router.push(`/hr/payroll/${record.id}`),
          style: { cursor: 'pointer' },
        })}
        locale={{
          emptyText: (
            <TableEmptyState
              icon={<DollarOutlined />}
              title={t('hr.payroll.list.emptyTitle')}
              description={t('hr.payroll.list.emptyDescription')}
            />
          ),
        }}
      />
    </div>
  );
}
