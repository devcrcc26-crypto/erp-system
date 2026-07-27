'use client';

import { useEffect, useMemo, useState } from 'react';
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
  Upload,
} from 'antd';
import { PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { Calendar } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import { layout, wideDetailDrawerProps } from '@/lib/theme/layout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import UserSelect from '@/components/ui/UserSelect/UserSelect';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  CreateDailyLogRequest,
  DailyLog,
} from '@/lib/api/project-management.types';
import { useUserDisplayResolver } from '@/hooks/useUserNameLookup';
import { useTablePagination } from '@/hooks/use-table-pagination';
import {
  useCreateDailyLog,
  useDailyLogs,
} from '@/lib/query/daily-logs';
import { useUploadDocumentToFolder } from '@/lib/query/documents';
import { useAllProjects } from '@/lib/query/projects';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  dailyLogStatusVariant,
  formatDailyLogStatus,
} from '@/lib/utils/pm-status-display';
import { DAILY_LOG_WORKFLOW } from '@/lib/api/workflow';
import DailyLogDetailDrawer from '@/components/modules/projects/daily-logs/DailyLogDetailDrawer';
import ProjectModuleGate from '@/components/modules/projects/ProjectModuleGate';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const SHIFT_OPTIONS = [
  { value: 'DAY', label: 'Day' },
  { value: 'NIGHT', label: 'Night' },
];

const STATUS_OPTIONS = DAILY_LOG_WORKFLOW.map((step) => ({
  value: step.key,
  label: step.label,
}));

interface DailyLogFormValues {
  logDate: Dayjs;
  shift?: string;
  weatherCondition?: string;
  temperatureC?: number;
  rainfallMm?: number;
  humidity?: number;
  contractorName?: string;
  workforceCount?: number;
  workSummary?: string;
  issues?: string;
  delays?: string;
  equipment?: string;
  materials?: string;
  supervisorId?: string;
}

/**
 * Create-daily-log drawer — project-scoped or with project selector for global page.
 */
export function DailyLogFormDrawer({
  open,
  projectId: projectIdProp,
  showProjectSelector = false,
  onClose,
  onSaved,
}: {
  open: boolean;
  projectId?: string;
  showProjectSelector?: boolean;
  onClose: () => void;
  onSaved: () => void;
}): React.ReactNode {
  const [form] = Form.useForm<DailyLogFormValues>();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    projectIdProp ?? null,
  );
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const effectiveProjectId = selectedProjectId ?? projectIdProp ?? '';

  const createDailyLog = useCreateDailyLog();
  const uploadDocument = useUploadDocumentToFolder();
  const messageApi = useAppMessage();

  const projectsQuery = useAllProjects({}, open && showProjectSelector);
  const projectOptions = useMemo(
    () =>
      (projectsQuery.data?.data ?? []).map((p) => ({
        value: p.id,
        label: `${p.projectCode} — ${p.name}`,
      })),
    [projectsQuery.data?.data],
  );

  useEffect(() => {
    if (open && projectIdProp) {
      setSelectedProjectId(projectIdProp);
    }
  }, [open, projectIdProp]);

  useEffect(() => {
    if (!open) {
      form.resetFields();
      setQueuedFiles([]);
      setUploading(false);
      if (showProjectSelector && !projectIdProp) {
        setSelectedProjectId(null);
      }
    }
  }, [open, form, showProjectSelector, projectIdProp]);

  async function uploadQueuedFiles(folderId: string): Promise<void> {
    setUploading(true);
    await Promise.all(
      queuedFiles.map((file) =>
        uploadDocument.mutateAsync({ folderId, file }),
      ),
    );
  }

  async function handleSubmit(values: DailyLogFormValues): Promise<void> {
    if (!effectiveProjectId) {
      messageApi.error('Select a project first');
      return;
    }

    const body: CreateDailyLogRequest = {
      logDate: values.logDate.format('YYYY-MM-DD'),
      shift: values.shift,
      weatherCondition: values.weatherCondition?.trim() || undefined,
      temperatureC: values.temperatureC,
      rainfallMm: values.rainfallMm,
      humidity: values.humidity,
      contractorName: values.contractorName?.trim() || undefined,
      workforceCount: values.workforceCount,
      workSummary: values.workSummary?.trim() || undefined,
      issues: values.issues?.trim() || undefined,
      delays: values.delays?.trim() || undefined,
      equipment: values.equipment?.trim() || undefined,
      materials: values.materials?.trim() || undefined,
      supervisorId: values.supervisorId || undefined,
    };

    try {
      const result = await createDailyLog.mutateAsync({
        projectId: effectiveProjectId,
        body,
      });

      if (queuedFiles.length > 0 && result.attachmentFolderId) {
        try {
          await uploadQueuedFiles(result.attachmentFolderId);
        } catch {
          messageApi.warning(
            'Daily log created but file upload failed. You can add files from the log detail.',
          );
          form.resetFields();
          setQueuedFiles([]);
          onSaved();
          onClose();
          return;
        }
      }

      messageApi.success('Daily log created successfully');
      form.resetFields();
      setQueuedFiles([]);
      onSaved();
      onClose();
    } catch (error) {
      notifyApiError(error, 'Failed to create daily log', messageApi);
    } finally {
      setUploading(false);
    }
  }

  return (
    <Drawer
      {...wideDetailDrawerProps}
      open={open}
      title="New daily log"
      onClose={onClose}
      destroyOnHidden
    >
      <Form<DailyLogFormValues>
        form={form}
        layout="vertical"
        className="erp-drawer-form"
        initialValues={{ logDate: dayjs() }}
        onFinish={(values: DailyLogFormValues) => void handleSubmit(values)}
      >
        {showProjectSelector && (
          <Form.Item label="Project" required>
            <Select
              showSearch
              placeholder="Select project"
              options={projectOptions}
              loading={projectsQuery.isLoading}
              optionFilterProp="label"
              value={selectedProjectId ?? undefined}
              onChange={(value: string) => setSelectedProjectId(value)}
            />
          </Form.Item>
        )}

        <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
          <Form.Item
            label="Log date"
            name="logDate"
            rules={[{ required: true, message: 'Log date is required' }]}
          >
            <DatePicker className="w-full" />
          </Form.Item>
          <Form.Item label="Log number">
            <Input disabled placeholder="Auto-generated on save (DL-…)" />
          </Form.Item>
        </div>

        <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
          <Form.Item label="Shift" name="shift">
            <Select allowClear options={SHIFT_OPTIONS} placeholder="Select shift" />
          </Form.Item>
          <Form.Item label="Weather" name="weatherCondition">
            <Input placeholder="e.g. Clear, overcast" />
          </Form.Item>
        </div>

        <div className="grid gap-4 md:grid-cols-3 md:gap-x-4">
          <Form.Item label="Temperature (°C)" name="temperatureC">
            <InputNumber className="!w-full" />
          </Form.Item>
          <Form.Item label="Rainfall (mm)" name="rainfallMm">
            <InputNumber className="!w-full" min={0} />
          </Form.Item>
          <Form.Item label="Humidity (%)" name="humidity">
            <InputNumber className="!w-full" min={0} max={100} />
          </Form.Item>
        </div>

        <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
          <Form.Item label="Contractor name" name="contractorName">
            <Input placeholder="Primary contractor on site" />
          </Form.Item>
          <Form.Item label="Workforce count" name="workforceCount">
            <InputNumber className="!w-full" min={0} precision={0} />
          </Form.Item>
        </div>

        <Form.Item label="Work description" name="workSummary">
          <Input.TextArea rows={4} placeholder="Work completed today" />
        </Form.Item>

        <Form.Item label="Issues / problems" name="issues">
          <Input.TextArea rows={3} placeholder="Issues encountered on site" />
        </Form.Item>

        <Form.Item label="Delays" name="delays">
          <Input.TextArea rows={3} placeholder="Delays and causes" />
        </Form.Item>

        <Form.Item label="Equipment on site" name="equipment">
          <Input.TextArea rows={3} placeholder="Equipment present on site" />
        </Form.Item>

        <Form.Item label="Materials delivered / used" name="materials">
          <Input.TextArea rows={3} placeholder="Materials delivered or consumed" />
        </Form.Item>

        <Form.Item label="Supervisor" name="supervisorId">
          <UserSelect placeholder="Optional supervisor" />
        </Form.Item>

        <Form.Item label="Attachments">
          <Upload
            multiple
            beforeUpload={(file) => {
              setQueuedFiles((prev) => [...prev, file]);
              return false;
            }}
            onRemove={(file) => {
              setQueuedFiles((prev) =>
                prev.filter((f) => f.name !== file.name),
              );
            }}
            fileList={queuedFiles.map((f) => ({
              uid: f.name,
              name: f.name,
              status: 'done' as const,
            }))}
          >
            <Button icon={<UploadOutlined />}>Add files</Button>
          </Upload>
        </Form.Item>

        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="primary"
            htmlType="submit"
            loading={createDailyLog.isPending || uploading}
            disabled={showProjectSelector && !effectiveProjectId}
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

  const resolveUserDisplay = useUserDisplayResolver();
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
        title: 'Log #',
        dataIndex: 'logNumber',
        key: 'logNumber',
        render: (value: string | null, record) => (
          <Button
            type="link"
            className="!px-0"
            onClick={() => setSelectedLogId(record.id)}
          >
            {value?.trim() || formatProjectDate(record.logDate)}
          </Button>
        ),
      },
      {
        title: 'Date',
        dataIndex: 'logDate',
        key: 'logDate',
        render: (value: string) => formatProjectDate(value),
      },
      {
        title: 'Shift',
        dataIndex: 'shift',
        key: 'shift',
        render: (value: string | null) => value ?? '-',
      },
      {
        title: 'Weather',
        dataIndex: 'weatherCondition',
        key: 'weatherCondition',
        render: (value: string | null) => value ?? '-',
      },
      {
        title: 'Workforce',
        key: 'workforce',
        render: (_: unknown, record: DailyLog) =>
          (record.workforceCount ?? record.totalWorkers) || '-',
      },
      {
        title: 'Contractor',
        dataIndex: 'contractorName',
        key: 'contractorName',
        render: (value: string | null) => value ?? '—',
      },
      {
        title: 'Site engineer',
        dataIndex: 'siteEngineerId',
        key: 'siteEngineerId',
        render: (_: unknown, record: DailyLog) =>
          resolveUserDisplay(record.siteEngineerId, record.siteEngineerName),
      },
      {
        title: 'Supervisor',
        key: 'supervisor',
        render: (_: unknown, record: DailyLog) =>
          record.supervisorId
            ? resolveUserDisplay(record.supervisorId, record.supervisorName)
            : '-',
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
    ],
    [resolveUserDisplay],
  );

  if (logsQuery.isLoading) {
    return <PageLoadingSkeleton />;
  }

  const logs = logsQuery.data?.data ?? [];
  const meta = logsQuery.data?.meta;

  return (
    <ProjectModuleGate projectId={projectId} module="daily_logs">
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
            <ListSearchInput
              placeholder="Search logs"
              className={layout.filterControl}
              committedValue={search}
              onCommit={(value) => {
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
    </ProjectModuleGate>
  );
}
