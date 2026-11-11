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
import { ArrowRight, Calendar } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import { type Dayjs } from 'dayjs';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import { layout, wideDetailDrawerProps } from '@/lib/theme/layout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import ListStatusTabs, {
  type ListStatusTabKey,
} from '@/components/ui/ListStatusTabs/ListStatusTabs';
import ProjectTeamUserSelect from '@/components/ui/ProjectTeamUserSelect/ProjectTeamUserSelect';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  CreateDailyLogRequest,
  DailyLog,
  DailyLogDetail,
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
import DailyLogDetailDrawer from '@/components/modules/projects/daily-logs/DailyLogDetailDrawer';
import ProjectModuleGate from '@/components/modules/projects/ProjectModuleGate';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import {
  SHIFT_OPTIONS,
  WEATHER_OPTIONS,
  RAINFALL_OPTIONS,
} from './daily-log-options';

const DAILY_LOG_ACTIVE_STATUSES = 'DRAFT,SUBMITTED';
const DAILY_LOG_APPROVED_STATUSES = 'APPROVED';

interface DailyLogFormValues {
  logDate: Dayjs;
  shift: string;
  contractorName?: string;
  supervisorId?: string;
  weatherCondition: string;
  temperatureC?: number;
  rainfallLevel?: string;
  humidity?: number;
  workDescription: string;
  issues?: string;
  delays?: string;
}

/**
 * Create-daily-log drawer - project-scoped or with project selector for global page.
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
  onSaved: (createdLog?: DailyLogDetail) => void;
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
        label: `${p.projectCode} - ${p.name}`,
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
      setQueuedFiles([]);
      setUploading(false);
      if (showProjectSelector && !projectIdProp) {
        setSelectedProjectId(null);
      }
    }
  }, [open, showProjectSelector, projectIdProp]);

  async function uploadQueuedFiles(folderId: string): Promise<void> {
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
      weatherCondition: values.weatherCondition,
      temperatureC: values.temperatureC,
      rainfallLevel: values.rainfallLevel || undefined,
      humidity: values.humidity,
      contractorName: values.contractorName?.trim() || undefined,
      workDescription: values.workDescription.trim(),
      issues: values.issues?.trim() || undefined,
      delays: values.delays?.trim() || undefined,
      supervisorId: values.supervisorId || undefined,
    };

    try {
      setUploading(true);
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
          onSaved(result);
          onClose();
          return;
        }
      }

      messageApi.success('Daily log created');
      form.resetFields();
      setQueuedFiles([]);
      onSaved(result);
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
      afterOpenChange={(visible) => {
        if (visible) {
          form.resetFields();
          setQueuedFiles([]);
          setUploading(false);
        }
      }}
    >
      <Form<DailyLogFormValues>
        form={form}
        layout="vertical"
        className="erp-drawer-form"
        initialValues={{}}
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
            <Input disabled placeholder="Will be assigned on save" />
          </Form.Item>
        </div>

        <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
          <Form.Item
            label="Shift"
            name="shift"
            rules={[{ required: true, message: 'Shift is required' }]}
          >
            <Select options={SHIFT_OPTIONS} placeholder="Select shift" />
          </Form.Item>
          <Form.Item label="Contractor name" name="contractorName">
            <Input placeholder="Primary contractor on site" />
          </Form.Item>
        </div>

        <Form.Item label="Supervisor" name="supervisorId">
          {effectiveProjectId ? (
            <ProjectTeamUserSelect
              projectId={effectiveProjectId}
              placeholder="Optional supervisor"
            />
          ) : (
            <Input disabled placeholder="Select a project first" />
          )}
        </Form.Item>

        <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
          <Form.Item
            label="Weather"
            name="weatherCondition"
            rules={[{ required: true, message: 'Weather is required' }]}
          >
            <Select options={WEATHER_OPTIONS} placeholder="Select weather" />
          </Form.Item>
          <Form.Item label="Temperature (°C)" name="temperatureC">
            <InputNumber className="!w-full" />
          </Form.Item>
        </div>

        <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
          <Form.Item label="Rainfall" name="rainfallLevel">
            <Select
              allowClear
              options={RAINFALL_OPTIONS}
              placeholder="Select rainfall"
            />
          </Form.Item>
          <Form.Item label="Humidity (%)" name="humidity">
            <InputNumber className="!w-full" min={0} max={100} />
          </Form.Item>
        </div>

        <Form.Item
          label="Work description"
          name="workDescription"
          rules={[{ required: true, message: 'Work description is required' }]}
        >
          <Input.TextArea rows={4} placeholder="Work completed today" />
        </Form.Item>

        <Form.Item label="Issues / problems" name="issues">
          <Input.TextArea rows={3} placeholder="Issues encountered on site" />
        </Form.Item>

        <Form.Item label="Delays" name="delays">
          <Input.TextArea rows={3} placeholder="Delays and causes" />
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
  const [activeTab, setActiveTab] = useState<ListStatusTabKey>('active');
  const [dateFrom, setDateFrom] = useState<Dayjs | null>(null);
  const [dateTo, setDateTo] = useState<Dayjs | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  const resolveUserDisplay = useUserDisplayResolver();

  const statusFilter =
    activeTab === 'active'
      ? DAILY_LOG_ACTIVE_STATUSES
      : DAILY_LOG_APPROVED_STATUSES;

  const logsQuery = useDailyLogs(projectId, {
    ...params,
    search: search.trim() || undefined,
    status: statusFilter,
    logDateFrom: dateFrom?.format('YYYY-MM-DD'),
    logDateTo: dateTo?.format('YYYY-MM-DD'),
  });

  const activeCountQuery = useDailyLogs(
    projectId,
    { page: 1, limit: 1, status: DAILY_LOG_ACTIVE_STATUSES },
    true,
    { select: (d) => d },
  );
  const approvedCountQuery = useDailyLogs(
    projectId,
    { page: 1, limit: 1, status: DAILY_LOG_APPROVED_STATUSES },
    true,
    { select: (d) => d },
  );

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
            onClick={(e) => {
              e.stopPropagation();
              setSelectedLogId(record.id);
            }}
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
          record.totalWorkers || record.workforceCount || '-',
      },
      {
        title: 'Incidents',
        dataIndex: 'incidentCount',
        key: 'incidentCount',
        render: (value: number) =>
          value > 0 ? (
            <span className="font-medium text-red-500">{value}</span>
          ) : (
            '0'
          ),
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
        title: 'Supervisor',
        key: 'supervisor',
        render: (_: unknown, record: DailyLog) =>
          record.supervisorId
            ? resolveUserDisplay(record.supervisorId, record.supervisorName)
            : '-',
      },
      {
        title: '',
        key: 'actions',
        width: 80,
        render: (_: unknown, record: DailyLog) => (
          <Button
            type="text"
            size="small"
            icon={<ArrowRight size={14} />}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedLogId(record.id);
            }}
          >
            Open
          </Button>
        ),
      },
    ],
    [resolveUserDisplay],
  );

  if (logsQuery.isLoading && !logsQuery.data) {
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

          <ListStatusTabs
            activeKey={activeTab}
            onChange={(key) => {
              setActiveTab(key);
              resetPage();
            }}
            activeLabel="Active"
            closedLabel="Approved"
            activeCount={activeCountQuery.data?.meta.total}
            closedCount={approvedCountQuery.data?.meta.total}
          />

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
            onRow={(record) => ({
              onClick: () => setSelectedLogId(record.id),
              style: { cursor: 'pointer' },
            })}
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
          onSaved={(createdLog) => {
            void logsQuery.refetch();
            void activeCountQuery.refetch();
            if (createdLog) {
              setSelectedLogId(createdLog.id);
            }
          }}
        />

        <DailyLogDetailDrawer
          projectId={projectId}
          dailyLogId={selectedLogId}
          onClose={() => setSelectedLogId(null)}
          onUpdated={() => {
            void logsQuery.refetch();
            void activeCountQuery.refetch();
            void approvedCountQuery.refetch();
          }}
        />
      </>
    </ProjectModuleGate>
  );
}
