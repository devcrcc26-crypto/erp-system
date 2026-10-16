// UI polish pass - styles only, no logic changes

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Alert,
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  Radio,
  Select,
  Space,
  TimePicker,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Users } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import { type Dayjs } from 'dayjs';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  Meeting,
  MeetingScope,
  MeetingStatus,
  MeetingType,
} from '@/lib/api/project-management.types';
import { useUserDisplayResolver } from '@/hooks/useUserNameLookup';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  useCreateMeeting,
  useEligibleMeetingSubtasks,
  useMeetings,
} from '@/lib/query/meetings';
import { useProjectDisciplines } from '@/lib/query/disciplines';
import { useAllProjects } from '@/lib/query/projects';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';
import { layout, wideDetailDrawerProps } from '@/lib/theme/layout';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatMeetingStatus,
  meetingStatusVariant,
} from '@/lib/utils/pm-status-display';
import { MEETING_WORKFLOW } from '@/lib/api/workflow';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import MeetingDetailDrawer from '@/components/modules/projects/meetings/MeetingDetailDrawer';
import ProjectModuleGate from '@/components/modules/projects/ProjectModuleGate';

const MEETING_TYPE_OPTIONS: { value: MeetingType; label: string }[] = [
  { value: 'PROGRESS', label: 'Progress' },
  { value: 'DESIGN_COORDINATION', label: 'Design coordination' },
  { value: 'SAFETY', label: 'Safety' },
  { value: 'CLIENT', label: 'Client' },
];

const STATUS_OPTIONS = MEETING_WORKFLOW.map((step) => ({
  value: step.key as MeetingStatus,
  label: step.label,
}));

interface MeetingFormValues {
  meetingType: MeetingType;
  title: string;
  scope: MeetingScope;
  taskDisciplineId?: string;
  designPackageId?: string;
  meetingDate: Dayjs;
  startTime?: Dayjs;
  endTime?: Dayjs;
  location?: string;
  agenda?: string;
}

function MeetingCreateFormBody({
  projectId: projectIdProp,
  showProjectSelector,
  onClose,
  onSaved,
}: {
  projectId?: string;
  showProjectSelector: boolean;
  onClose: () => void;
  onSaved: () => void;
}): React.ReactNode {
  const router = useRouter();
  const [form] = Form.useForm<MeetingFormValues>();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    projectIdProp ?? null,
  );
  const effectiveProjectId = selectedProjectId ?? projectIdProp ?? '';
  const createMeeting = useCreateMeeting();
  const messageApi = useAppMessage();

  const projectsQuery = useAllProjects({}, showProjectSelector);
  const projectOptions = useMemo(
    () =>
      (projectsQuery.data?.data ?? []).map((p) => ({
        value: p.id,
        label: `${p.projectCode} - ${p.name}`,
      })),
    [projectsQuery.data?.data],
  );

  const disciplinesQuery = useProjectDisciplines(
    effectiveProjectId,
    Boolean(effectiveProjectId),
  );
  const disciplineOptions = useMemo(
    () =>
      (disciplinesQuery.data ?? []).map((d) => ({
        value: d.id,
        label: d.disciplineName,
      })),
    [disciplinesQuery.data],
  );

  const subtasksQuery = useEligibleMeetingSubtasks(
    effectiveProjectId,
    Boolean(effectiveProjectId),
  );
  const subtaskOptions = useMemo(
    () =>
      (subtasksQuery.data ?? []).map((s) => ({
        value: s.id,
        label: `${s.fullCode} - ${s.name}`,
        taskDisciplineId: s.taskDisciplineId,
      })),
    [subtasksQuery.data],
  );

  const [scope, setScope] = useState<MeetingScope>('PROJECT');

  async function handleSubmit(values: MeetingFormValues): Promise<void> {
    if (!effectiveProjectId) {
      messageApi.error('Select a project first');
      return;
    }
    try {
      const created = await createMeeting.mutateAsync({
        projectId: effectiveProjectId,
        body: {
          meetingType: values.meetingType,
          title: values.title.trim(),
          scope: values.scope,
          taskDisciplineId:
            values.scope !== 'PROJECT' ? values.taskDisciplineId : undefined,
          designPackageId:
            values.scope === 'SUBTASK' ? values.designPackageId : undefined,
          meetingDate: values.meetingDate.format('YYYY-MM-DD'),
          startTime: values.startTime?.format('HH:mm'),
          endTime: values.endTime?.format('HH:mm'),
          location: values.location?.trim() || undefined,
          agenda: values.agenda?.trim() || undefined,
        },
      });
      messageApi.success('Meeting created');
      form.resetFields();
      setScope('PROJECT');
      onSaved();
      onClose();
      router.push(`/projects/${effectiveProjectId}/meetings/${created.id}`);
    } catch (error) {
      notifyApiError(error, 'Failed to create meeting', messageApi);
    }
  }

  return (
      <Form<MeetingFormValues>
        form={form}
        layout="vertical"
        className="erp-drawer-form"
        initialValues={{ meetingType: 'PROGRESS', scope: 'PROJECT' }}
        onValuesChange={(changed) => {
          if (changed.scope !== undefined) {
            setScope(changed.scope);
          }
        }}
        onFinish={(values: MeetingFormValues) => void handleSubmit(values)}
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
              onChange={(value: string) => {
                setSelectedProjectId(value);
                form.setFieldValue('taskDisciplineId', undefined);
                form.setFieldValue('designPackageId', undefined);
              }}
            />
          </Form.Item>
        )}

        <Form.Item
          label="Meeting type"
          name="meetingType"
          rules={[{ required: true }]}
        >
          <Select options={MEETING_TYPE_OPTIONS} />
        </Form.Item>
        <Form.Item
          label="Title"
          name="title"
          rules={[{ required: true, message: 'Title is required' }]}
        >
          <Input placeholder="Weekly progress meeting" />
        </Form.Item>

        <Form.Item label="Scope" name="scope">
          <Radio.Group
            disabled={!effectiveProjectId}
            onChange={() => {
              form.setFieldValue('taskDisciplineId', undefined);
              form.setFieldValue('designPackageId', undefined);
            }}
          >
            <Radio value="PROJECT">Project-wide</Radio>
            <Radio value="DISCIPLINE">Discipline</Radio>
            <Radio value="SUBTASK">Subtask</Radio>
          </Radio.Group>
        </Form.Item>

        {(scope === 'DISCIPLINE' || scope === 'SUBTASK') && (
          <Form.Item
            label="Discipline"
            name="taskDisciplineId"
            rules={[{ required: true, message: 'Discipline is required' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select discipline"
              loading={disciplinesQuery.isLoading}
              disabled={!effectiveProjectId}
              options={disciplineOptions}
            />
          </Form.Item>
        )}

        {scope === 'SUBTASK' && (
          <Form.Item
            label="Subtask"
            name="designPackageId"
            rules={[{ required: true, message: 'Subtask is required' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select subtask"
              loading={subtasksQuery.isLoading}
              disabled={!effectiveProjectId}
              options={subtaskOptions}
              onChange={(value: string) => {
                const match = subtaskOptions.find((o) => o.value === value);
                if (match) {
                  form.setFieldValue('taskDisciplineId', match.taskDisciplineId);
                }
              }}
            />
          </Form.Item>
        )}

        <div className="grid gap-4 md:grid-cols-3 md:gap-x-4">
          <Form.Item
            label="Meeting date"
            name="meetingDate"
            rules={[{ required: true }]}
          >
            <DatePicker className="w-full" />
          </Form.Item>
          <Form.Item label="Start time" name="startTime">
            <TimePicker className="w-full" format="HH:mm" />
          </Form.Item>
          <Form.Item label="End time" name="endTime">
            <TimePicker className="w-full" format="HH:mm" />
          </Form.Item>
        </div>
        <Form.Item label="Location" name="location">
          <Input placeholder="Site office, room 2" />
        </Form.Item>
        <Form.Item label="Agenda" name="agenda">
          <Input.TextArea rows={3} placeholder="Topics to be discussed" />
        </Form.Item>

        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="primary"
            htmlType="submit"
            loading={createMeeting.isPending}
            disabled={!effectiveProjectId}
          >
            Create meeting
          </Button>
        </div>
      </Form>
  );
}

export function MeetingFormDrawer({
  open,
  projectId,
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
  return (
    <Drawer
      {...wideDetailDrawerProps}
      open={open}
      title="New meeting"
      onClose={onClose}
      destroyOnHidden
    >
      {open ? (
        <MeetingCreateFormBody
          projectId={projectId}
          showProjectSelector={showProjectSelector}
          onClose={onClose}
          onSaved={onSaved}
        />
      ) : null}
    </Drawer>
  );
}

export default function MeetingsPageContent({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const { params, resetPage, bindMeta } = useTablePagination();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<MeetingStatus | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);

  useEffect(() => {
    const meetingIdParam = searchParams.get('meetingId');
    if (meetingIdParam) {
      setSelectedMeetingId(meetingIdParam);
      router.replace(`/projects/${projectId}/meetings`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const resolveUserDisplay = useUserDisplayResolver();
  const permLoading = usePermissionsLoading();
  const meetingsQuery = useMeetings(projectId, {
    ...params,
    search: search.trim() || undefined,
    status: statusFilter,
  }, !permLoading);

  const columns: ColumnsType<Meeting> = useMemo(
    () => [
      {
        title: 'Meeting #',
        dataIndex: 'meetingNumber',
        key: 'meetingNumber',
        render: (value: string, record) => (
          <Button
            type="link"
            className="!px-0"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedMeetingId(record.id);
            }}
          >
            {value}
          </Button>
        ),
      },
      {
        title: 'Title',
        dataIndex: 'title',
        key: 'title',
        ellipsis: true,
      },
      {
        title: 'Type',
        dataIndex: 'meetingType',
        key: 'meetingType',
        render: (value: string) => value.replace(/_/g, ' '),
      },
      {
        title: 'Date',
        dataIndex: 'meetingDate',
        key: 'meetingDate',
        render: (value: string) => formatProjectDate(value),
      },
      {
        title: 'Organizer',
        dataIndex: 'organizerId',
        key: 'organizerId',
        render: (_: unknown, record: Meeting) =>
          resolveUserDisplay(record.organizerId, record.organizerName),
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (status: MeetingStatus) => (
          <StatusBadge
            label={formatMeetingStatus(status)}
            variant={meetingStatusVariant(status)}
          />
        ),
      },
    ],
    [resolveUserDisplay],
  );

  if (meetingsQuery.isLoading) {
    return <PageLoadingSkeleton />;
  }

  const meetings = meetingsQuery.data?.data ?? [];
  const meta = meetingsQuery.data?.meta;

  return (
    <ProjectModuleGate projectId={projectId} module="meetings">
    <>
      <FormLayout
        title="Meetings"
        description="Project meetings, attendees, agenda, and action items."
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
          >
            New meeting
          </Button>
        }
      >
        {meetingsQuery.isError && (
          <Alert
            type="error"
            showIcon
            className="!mb-4"
            title="Unable to load meetings"
            description={
              meetingsQuery.error instanceof ApiRequestError
                ? meetingsQuery.error.message
                : 'Please try again.'
            }
          />
        )}

        <Space wrap className="!mb-4">
          <ListSearchInput
            placeholder="Search meetings"
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
            onChange={(value: MeetingStatus | undefined) => {
              resetPage();
              setStatusFilter(value);
            }}
          />
        </Space>

        <DataTable<Meeting>
          rowKey="id"
          columns={columns}
          dataSource={meetings}
          pagination={bindMeta(meta)}
          onRow={(record) => ({
            onClick: () => setSelectedMeetingId(record.id),
            style: { cursor: 'pointer' },
          })}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<Users />}
                title="No meetings"
                description="Schedule project meetings to track agenda, attendees, and actions"
                action={{ label: 'New meeting', onClick: () => setCreateOpen(true) }}
              />
            ),
          }}
        />
      </FormLayout>

      <MeetingFormDrawer
        open={createOpen}
        projectId={projectId}
        onClose={() => setCreateOpen(false)}
        onSaved={() => void meetingsQuery.refetch()}
      />

      <MeetingDetailDrawer
        projectId={projectId}
        meetingId={selectedMeetingId}
        onClose={() => setSelectedMeetingId(null)}
        onUpdated={() => void meetingsQuery.refetch()}
      />
    </>
    </ProjectModuleGate>
  );
}
