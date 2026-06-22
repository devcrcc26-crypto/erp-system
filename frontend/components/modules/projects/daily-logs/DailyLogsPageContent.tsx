'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Spin,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Calendar } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { layout } from '@/lib/theme/layout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { ApiRequestError } from '@/lib/api/errors';
import type { DailyLog } from '@/lib/api/project-management.types';
import { useUserNameLookup } from '@/hooks/useUserNameLookup';
import { useTablePagination } from '@/hooks/use-table-pagination';
import {
  useCreateDailyLog,
  useDailyLogs,
} from '@/lib/query/daily-logs';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  dailyLogStatusVariant,
  formatDailyLogStatus,
} from '@/lib/utils/pm-status-display';
import DailyLogDetailDrawer from '@/components/modules/projects/daily-logs/DailyLogDetailDrawer';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const SHIFT_OPTIONS = [
  { value: 'DAY', label: 'Day' },
  { value: 'NIGHT', label: 'Night' },
];

const STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'APPROVED', label: 'Approved' },
];

interface DailyLogFormValues {
  logDate: Dayjs;
  shift?: string;
  weatherCondition?: string;
  temperatureC?: number;
  rainfallMm?: number;
  workSummary?: string;
}

function DailyLogFormDrawer({
  open,
  projectId,
  onClose,
  onSaved,
}: {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
}): React.ReactNode {
  const [form] = Form.useForm<DailyLogFormValues>();
  const createDailyLog = useCreateDailyLog();
  const messageApi = useAppMessage();

  async function handleSubmit(values: DailyLogFormValues): Promise<void> {
    try {
      await createDailyLog.mutateAsync({
        projectId,
        body: {
          logDate: values.logDate.format('YYYY-MM-DD'),
          shift: values.shift,
          weatherCondition: values.weatherCondition?.trim() || undefined,
          temperatureC: values.temperatureC,
          rainfallMm: values.rainfallMm,
          workSummary: values.workSummary?.trim() || undefined,
        },
      });
      messageApi.success('Daily log created successfully');
      form.resetFields();
      onSaved();
      onClose();
    } catch (error) {
      notifyApiError(error, 'Failed to create daily log', messageApi);
    }
  }

  return (
    <Drawer
      open={open}
      title="New daily log"
      onClose={onClose}
      size="large"
      destroyOnHidden
    >
      <Form<DailyLogFormValues>
        form={form}
        layout="vertical"
        initialValues={{ logDate: dayjs() }}
        onFinish={(values: DailyLogFormValues) => void handleSubmit(values)}
      >
        <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
          <Form.Item
            label="Log date"
            name="logDate"
            rules={[{ required: true, message: 'Log date is required' }]}
          >
            <DatePicker className="w-full" />
          </Form.Item>
          <Form.Item label="Shift" name="shift">
            <Select allowClear options={SHIFT_OPTIONS} placeholder="Select shift" />
          </Form.Item>
        </div>
        <Form.Item label="Weather" name="weatherCondition">
          <Input placeholder="e.g. Clear, overcast" />
        </Form.Item>
        <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
          <Form.Item label="Temperature (°C)" name="temperatureC">
            <InputNumber className="!w-full" />
          </Form.Item>
          <Form.Item label="Rainfall (mm)" name="rainfallMm">
            <InputNumber className="!w-full" min={0} />
          </Form.Item>
        </div>
        <Form.Item label="Work summary" name="workSummary">
          <Input.TextArea rows={4} placeholder="Work completed today" />
        </Form.Item>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="primary"
            htmlType="submit"
            loading={createDailyLog.isPending}
          >
            Create log
          </Button>
        </div>
      </Form>
    </Drawer>
  );
}

export default function DailyLogsPageContent({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const { params, resetPage, bindMeta } = useTablePagination();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [dateFrom, setDateFrom] = useState<Dayjs | null>(null);
  const [dateTo, setDateTo] = useState<Dayjs | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  const resolveUserName = useUserNameLookup();
  const logsQuery = useDailyLogs(projectId, {
    ...params,
    search: search.trim() || undefined,
    status: statusFilter,
    logDateFrom: dateFrom?.format('YYYY-MM-DD'),
    logDateTo: dateTo?.format('YYYY-MM-DD'),
  });

  const columns: ColumnsType<DailyLog> = useMemo(
    () => [
      {
        title: 'Date',
        dataIndex: 'logDate',
        key: 'logDate',
        render: (value: string, record) => (
          <Button
            type="link"
            className="!px-0"
            onClick={() => setSelectedLogId(record.id)}
          >
            {formatProjectDate(value)}
          </Button>
        ),
      },
      {
        title: 'Shift',
        dataIndex: 'shift',
        key: 'shift',
        render: (value: string | null) => value ?? '—',
      },
      {
        title: 'Site engineer',
        dataIndex: 'siteEngineerId',
        key: 'siteEngineerId',
        render: (userId: string) => resolveUserName(userId),
      },
      {
        title: 'Weather',
        dataIndex: 'weatherCondition',
        key: 'weatherCondition',
        render: (value: string | null) => value ?? '—',
      },
      {
        title: 'Workers',
        dataIndex: 'totalWorkers',
        key: 'totalWorkers',
        render: (value: number) => value || '—',
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (status: string) => (
          <StatusBadge
            label={formatDailyLogStatus(status)}
            variant={dailyLogStatusVariant(status)}
          />
        ),
      },
      {
        title: 'Work summary',
        dataIndex: 'workSummary',
        key: 'workSummary',
        ellipsis: true,
        render: (value: string | null) => value ?? '—',
      },
    ],
    [resolveUserName],
  );

  if (logsQuery.isLoading) {
    return (
      <div className="flex justify-center rounded-md bg-white p-12 shadow-sm">
        <Spin />
      </div>
    );
  }

  const logs = logsQuery.data?.data ?? [];
  const meta = logsQuery.data?.meta;

  return (
    <>
      <FormLayout
        title="Daily site logs"
        description="Record weather, workforce, equipment, and work completed on site each day."
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
          >
            New daily log
          </Button>
        }
      >
        {logsQuery.isError && (
          <Alert
            type="error"
            showIcon
            className="!mb-4"
            title="Unable to load daily logs"
            description={
              logsQuery.error instanceof ApiRequestError
                ? logsQuery.error.message
                : 'Please try again.'
            }
          />
        )}

        <Space wrap className="!mb-4">
          <Input.Search
            allowClear
            placeholder="Search logs"
            className={layout.filterControl}
            onSearch={(value: string) => {
              resetPage();
              setSearch(value);
            }}
          />
          <Select
            allowClear
            placeholder="Status"
            className={layout.filterControl}
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(value: string | undefined) => {
              resetPage();
              setStatusFilter(value);
            }}
          />
          <DatePicker
            placeholder="From date"
            value={dateFrom}
            onChange={(value: Dayjs | null) => {
              resetPage();
              setDateFrom(value);
            }}
          />
          <DatePicker
            placeholder="To date"
            value={dateTo}
            onChange={(value: Dayjs | null) => {
              resetPage();
              setDateTo(value);
            }}
          />
        </Space>

        <DataTable<DailyLog>
          rowKey="id"
          columns={columns}
          dataSource={logs}
          pagination={bindMeta(meta)}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<Calendar />}
                title="No daily logs"
                description="Daily logs will appear here once created"
                action={{ label: 'New log', onClick: () => setCreateOpen(true) }}
              />
            ),
          }}
        />
      </FormLayout>

      <DailyLogFormDrawer
        open={createOpen}
        projectId={projectId}
        onClose={() => setCreateOpen(false)}
        onSaved={() => void logsQuery.refetch()}
      />

      <DailyLogDetailDrawer
        projectId={projectId}
        dailyLogId={selectedLogId}
        onClose={() => setSelectedLogId(null)}
        onUpdated={() => void logsQuery.refetch()}
      />
    </>
  );
}
