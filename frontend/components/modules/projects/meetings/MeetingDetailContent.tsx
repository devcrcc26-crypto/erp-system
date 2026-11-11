'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  DatePicker,
  Descriptions,
  Form,
  Input,
  Modal,
  Radio,
  Select,
  Space,
  TimePicker,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DataTable from '@/components/ui/DataTable/DataTable';
import DocumentAttachmentPanel from '@/components/ui/DocumentAttachmentPanel/DocumentAttachmentPanel';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import UserSelect from '@/components/ui/UserSelect/UserSelect';
import IssueDetailDrawer from '@/components/modules/projects/issues/IssueDetailDrawer';
import CreateIssueFromActionItemModal from '@/components/modules/projects/meetings/CreateIssueFromActionItemModal';
import type {
  ActionItem,
  MeetingAttendee,
  MeetingDetail,
  MeetingScope,
} from '@/lib/api/project-management.types';
import { useUserDisplayResolver } from '@/hooks/useUserNameLookup';
import { useAppMessage, useAppModal } from '@/hooks/use-app-message';
import {
  useEpcCapabilities,
  usePmCapabilities,
} from '@/hooks/use-pm-capabilities';
import { useAuthStore } from '@/stores/auth.store';
import {
  useAddMeetingActionItem,
  useAddMeetingAttendee,
  useCancelMeeting,
  useDeleteMeeting,
  useEligibleMeetingSubtasks,
  useMeeting,
  useRemoveMeetingActionItem,
  useRemoveMeetingAttendee,
  useUpdateMeeting,
  useUpdateMeetingActionItem,
} from '@/lib/query/meetings';
import { useProjectDisciplines } from '@/lib/query/disciplines';
import { layout } from '@/lib/theme/layout';
import { ApiRequestError } from '@/lib/api/errors';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatIssueStatus,
  formatMeetingStatus,
  issueStatusVariant,
  meetingStatusVariant,
} from '@/lib/utils/pm-status-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const ACTIVE_MINUTES_STATUSES = new Set(['SCHEDULED', 'IN_PROGRESS', 'CONDUCTED']);

function actionItemTitle(item: ActionItem): string {
  if (item.title?.trim()) return item.title.trim();
  const desc = item.description.trim();
  return desc.length > 50 ? `${desc.slice(0, 50)}…` : desc;
}

function AddAttendeeForm({
  projectId,
  meetingId,
  existingUserIds,
  onAdded,
}: {
  projectId: string;
  meetingId: string;
  existingUserIds: string[];
  onAdded: () => void;
}): React.ReactNode {
  const [form] = Form.useForm();
  const [attendeeType, setAttendeeType] = useState<'INTERNAL' | 'EXTERNAL'>(
    'INTERNAL',
  );
  const messageApi = useAppMessage();
  const addAttendee = useAddMeetingAttendee();

  return (
    <Form
      form={form}
      layout="vertical"
      className="erp-drawer-form !mt-3"
      onFinish={(values: {
        userIds?: string[];
        externalName?: string;
        organization?: string;
        roleAtMeeting?: string;
        email?: string;
      }) => {
        void (async () => {
          try {
            if (attendeeType === 'INTERNAL') {
              const userIds = values.userIds ?? [];
              for (const userId of userIds) {
                await addAttendee.mutateAsync({
                  projectId,
                  meetingId,
                  body: { attendeeType: 'INTERNAL', userId },
                });
              }
              messageApi.success(
                userIds.length > 1 ? 'Attendees added' : 'Attendee added',
              );
            } else {
              await addAttendee.mutateAsync({
                projectId,
                meetingId,
                body: {
                  attendeeType: 'EXTERNAL',
                  externalName: values.externalName,
                  organization: values.organization,
                  roleAtMeeting: values.roleAtMeeting,
                  email: values.email,
                },
              });
              messageApi.success('Attendee added');
            }
            form.resetFields();
            onAdded();
          } catch (e: unknown) {
            notifyApiError(e, 'Failed to add attendee', messageApi);
          }
        })();
      }}
    >
      <Radio.Group
        className="!mb-2"
        value={attendeeType}
        onChange={(e) => {
          setAttendeeType(e.target.value);
          form.resetFields();
        }}
      >
        <Radio value="INTERNAL">Internal</Radio>
        <Radio value="EXTERNAL">External</Radio>
      </Radio.Group>
      {attendeeType === 'INTERNAL' ? (
        <Form.Item
          name="userIds"
          label="Project team members"
          rules={[{ required: true, message: 'Select at least one user' }]}
        >
          <UserSelect
            mode="multiple"
            placeholder="Select team members"
            excludeUserIds={existingUserIds}
          />
        </Form.Item>
      ) : (
        <>
          <Form.Item
            name="externalName"
            label="Name"
            rules={[{ required: true, message: 'Name is required' }]}
          >
            <Input placeholder="Eng. Yohannes" />
          </Form.Item>
          <div className="grid gap-4 sm:grid-cols-3">
            <Form.Item name="organization" label="Company">
              <Input />
            </Form.Item>
            <Form.Item name="roleAtMeeting" label="Discipline">
              <Input placeholder="Structural reviewer" />
            </Form.Item>
            <Form.Item name="email" label="Email">
              <Input type="email" />
            </Form.Item>
          </div>
        </>
      )}
      <Button
        type="primary"
        htmlType="submit"
        icon={<PlusOutlined />}
        loading={addAttendee.isPending}
      >
        Add attendee
      </Button>
    </Form>
  );
}

function AddActionItemForm({
  projectId,
  meetingId,
  onAdded,
}: {
  projectId: string;
  meetingId: string;
  onAdded: () => void;
}): React.ReactNode {
  const [form] = Form.useForm();
  const messageApi = useAppMessage();
  const addAction = useAddMeetingActionItem();

  return (
    <Form
      form={form}
      layout="vertical"
      className="erp-drawer-form !mt-3"
      onFinish={(values: {
        title?: string;
        ownerId?: string;
        description: string;
        dueDate?: Dayjs;
      }) =>
        void addAction
          .mutateAsync({
            projectId,
            meetingId,
            body: {
              title: values.title?.trim() || undefined,
              ownerId: values.ownerId,
              description: values.description.trim(),
              dueDate: values.dueDate?.format('YYYY-MM-DD'),
            },
          })
          .then(() => {
            messageApi.success('Action item added');
            form.resetFields();
            onAdded();
          })
          .catch((e: unknown) =>
            notifyApiError(e, 'Failed to add action item', messageApi),
          )
      }
    >
      <Form.Item name="title" label="Title">
        <Input placeholder="Short summary of the action" />
      </Form.Item>
      <Form.Item
        name="description"
        label="Description"
        rules={[{ required: true }]}
      >
        <Input.TextArea rows={2} />
      </Form.Item>
      <div className="grid gap-4 sm:grid-cols-2">
        <Form.Item name="ownerId" label="Assigned to">
          <UserSelect allowClear />
        </Form.Item>
        <Form.Item name="dueDate" label="Due date">
          <DatePicker className="w-full" />
        </Form.Item>
      </div>
      <Button
        type="primary"
        htmlType="submit"
        icon={<PlusOutlined />}
        loading={addAction.isPending}
      >
        Add action item
      </Button>
    </Form>
  );
}

function EditMeetingModal({
  open,
  projectId,
  meeting,
  onClose,
  onSaved,
}: {
  open: boolean;
  projectId: string;
  meeting: MeetingDetail;
  onClose: () => void;
  onSaved: () => void;
}): React.ReactNode {
  return (
    <Modal
      title="Edit meeting"
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      width={640}
    >
      {open ? (
        <EditMeetingForm
          projectId={projectId}
          meeting={meeting}
          onClose={onClose}
          onSaved={onSaved}
        />
      ) : null}
    </Modal>
  );
}

function EditMeetingForm({
  projectId,
  meeting,
  onClose,
  onSaved,
}: {
  projectId: string;
  meeting: MeetingDetail;
  onClose: () => void;
  onSaved: () => void;
}): React.ReactNode {
  const [form] = Form.useForm();
  const [scope, setScope] = useState<MeetingScope>(
    (meeting.scope as MeetingScope) ?? 'PROJECT',
  );
  const messageApi = useAppMessage();
  const updateMeeting = useUpdateMeeting();

  const disciplinesQuery = useProjectDisciplines(projectId, true);
  const disciplineOptions = useMemo(
    () =>
      (disciplinesQuery.data ?? []).map((d) => ({
        value: d.id,
        label: d.disciplineName,
      })),
    [disciplinesQuery.data],
  );

  const subtasksQuery = useEligibleMeetingSubtasks(projectId, true);
  const subtaskOptions = useMemo(
    () =>
      (subtasksQuery.data ?? []).map((s) => ({
        value: s.id,
        label: `${s.fullCode} - ${s.name}`,
        taskDisciplineId: s.taskDisciplineId,
      })),
    [subtasksQuery.data],
  );

  return (
    <Form
      key={meeting.id}
      form={form}
      layout="vertical"
      className="erp-drawer-form"
      initialValues={{
        title: meeting.title,
        meetingDate: meeting.meetingDate
          ? dayjs(meeting.meetingDate)
          : undefined,
        startTime: meeting.startTime
          ? dayjs(meeting.startTime, 'HH:mm')
          : undefined,
        endTime: meeting.endTime
          ? dayjs(meeting.endTime, 'HH:mm')
          : undefined,
        location: meeting.location ?? undefined,
        agenda: meeting.agenda ?? undefined,
        scope: (meeting.scope as MeetingScope) ?? 'PROJECT',
        taskDisciplineId: meeting.taskDisciplineId ?? undefined,
        designPackageId: meeting.designPackageId ?? undefined,
      }}
      onValuesChange={(changed) => {
        if (changed.scope !== undefined) {
          setScope(changed.scope);
        }
      }}
      onFinish={(values: {
        title: string;
        meetingDate: Dayjs;
        startTime?: Dayjs;
        endTime?: Dayjs;
        location?: string;
        agenda?: string;
        scope: MeetingScope;
        taskDisciplineId?: string;
        designPackageId?: string;
      }) =>
        void updateMeeting
          .mutateAsync({
            projectId,
            meetingId: meeting.id,
            body: {
              title: values.title.trim(),
              meetingDate: values.meetingDate.format('YYYY-MM-DD'),
              startTime: values.startTime?.format('HH:mm'),
              endTime: values.endTime?.format('HH:mm'),
              location: values.location?.trim() || undefined,
              agenda: values.agenda?.trim() || undefined,
              scope: values.scope,
              taskDisciplineId:
                values.scope !== 'PROJECT' ? values.taskDisciplineId : undefined,
              designPackageId:
                values.scope === 'SUBTASK' ? values.designPackageId : undefined,
            },
          })
          .then(() => {
            messageApi.success('Meeting updated');
            onSaved();
            onClose();
          })
          .catch((e: unknown) =>
            notifyApiError(e, 'Failed to update meeting', messageApi),
          )
      }
    >
      <Form.Item
        name="title"
        label="Title"
        rules={[{ required: true, message: 'Title is required' }]}
      >
        <Input />
      </Form.Item>
      <div className="grid gap-4 sm:grid-cols-3">
        <Form.Item
          name="meetingDate"
          label="Meeting date"
          rules={[{ required: true }]}
        >
          <DatePicker className="w-full" />
        </Form.Item>
        <Form.Item name="startTime" label="Start time">
          <TimePicker className="w-full" format="HH:mm" />
        </Form.Item>
        <Form.Item name="endTime" label="End time">
          <TimePicker className="w-full" format="HH:mm" />
        </Form.Item>
      </div>
      <Form.Item name="location" label="Location">
        <Input />
      </Form.Item>
      <Form.Item name="agenda" label="Agenda">
        <Input.TextArea rows={3} />
      </Form.Item>
      <Form.Item name="scope" label="Scope">
        <Radio.Group
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
          name="taskDisciplineId"
          label="Discipline"
          rules={[{ required: true, message: 'Discipline is required' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            options={disciplineOptions}
            loading={disciplinesQuery.isLoading}
          />
        </Form.Item>
      )}
      {scope === 'SUBTASK' && (
        <Form.Item
          name="designPackageId"
          label="Subtask"
          rules={[{ required: true, message: 'Subtask is required' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            options={subtaskOptions}
            loading={subtasksQuery.isLoading}
            onChange={(value: string) => {
              const match = subtaskOptions.find((o) => o.value === value);
              if (match) {
                form.setFieldValue('taskDisciplineId', match.taskDisciplineId);
              }
            }}
          />
        </Form.Item>
      )}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          type="primary"
          htmlType="submit"
          loading={updateMeeting.isPending}
        >
          Save
        </Button>
      </div>
    </Form>
  );
}

function ActionItemViewModal({
  open,
  item,
  resolveUserDisplay,
  onClose,
  onOpenIssue,
}: {
  open: boolean;
  item: ActionItem | null;
  resolveUserDisplay: (id: string | null | undefined, fallback?: string | null) => string;
  onClose: () => void;
  onOpenIssue: (issueId: string) => void;
}): React.ReactNode {
  if (!item) return null;
  return (
    <Modal
      title="Action item"
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="close" onClick={onClose}>
          Close
        </Button>,
      ]}
      destroyOnHidden
    >
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="Title">
          {item.title?.trim() || '-'}
        </Descriptions.Item>
        <Descriptions.Item label="Description">
          <span className="whitespace-pre-wrap">{item.description}</span>
        </Descriptions.Item>
        <Descriptions.Item label="Assigned to">
          {item.ownerId
            ? resolveUserDisplay(item.ownerId, item.ownerName)
            : (item.assignedToName ?? '-')}
        </Descriptions.Item>
        <Descriptions.Item label="Due date">
          {item.dueDate ? formatProjectDate(item.dueDate) : '-'}
        </Descriptions.Item>
        <Descriptions.Item label="Status">
          {item.status === 'CLOSED' ? 'Done' : 'Open'}
        </Descriptions.Item>
        <Descriptions.Item label="Linked issue">
          {item.linkedIssueId ? (
            <Button
              type="link"
              className="!px-0"
              onClick={() => onOpenIssue(item.linkedIssueId!)}
            >
              {item.linkedIssueNumber ?? item.linkedIssueId}
            </Button>
          ) : (
            '-'
          )}
        </Descriptions.Item>
        <Descriptions.Item label="Created by">
          {resolveUserDisplay(item.createdBy)}
        </Descriptions.Item>
        <Descriptions.Item label="Created">
          {item.createdAt ? formatProjectDate(item.createdAt) : '-'}
        </Descriptions.Item>
      </Descriptions>
    </Modal>
  );
}

function ActionItemEditModal({
  open,
  projectId,
  meetingId,
  item,
  onClose,
  onSaved,
}: {
  open: boolean;
  projectId: string;
  meetingId: string;
  item: ActionItem | null;
  onClose: () => void;
  onSaved: () => void;
}): React.ReactNode {
  return (
    <Modal
      title="Edit action item"
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
    >
      {open && item ? (
        <ActionItemEditForm
          projectId={projectId}
          meetingId={meetingId}
          item={item}
          onClose={onClose}
          onSaved={onSaved}
        />
      ) : null}
    </Modal>
  );
}

function ActionItemEditForm({
  projectId,
  meetingId,
  item,
  onClose,
  onSaved,
}: {
  projectId: string;
  meetingId: string;
  item: ActionItem;
  onClose: () => void;
  onSaved: () => void;
}): React.ReactNode {
  const [form] = Form.useForm();
  const messageApi = useAppMessage();
  const updateAction = useUpdateMeetingActionItem();

  return (
    <Form
      key={item.id}
      form={form}
      layout="vertical"
      className="erp-drawer-form"
      initialValues={{
        title: item.title ?? undefined,
        description: item.description,
        ownerId: item.ownerId ?? undefined,
        dueDate: item.dueDate ? dayjs(item.dueDate) : undefined,
      }}
      onFinish={(values: {
        title?: string;
        description: string;
        ownerId?: string;
        dueDate?: Dayjs;
      }) =>
        void updateAction
          .mutateAsync({
            projectId,
            meetingId,
            actionItemId: item.id,
            body: {
              title: values.title?.trim() || undefined,
              description: values.description.trim(),
              ownerId: values.ownerId,
              dueDate: values.dueDate?.format('YYYY-MM-DD'),
            },
          })
          .then(() => {
            messageApi.success('Action item updated');
            onSaved();
            onClose();
          })
          .catch((e: unknown) =>
            notifyApiError(e, 'Failed to update action item', messageApi),
          )
      }
    >
      <Form.Item name="title" label="Title">
        <Input placeholder="Short summary of the action" />
      </Form.Item>
      <Form.Item
        name="description"
        label="Description"
        rules={[{ required: true }]}
      >
        <Input.TextArea rows={3} />
      </Form.Item>
      <Form.Item name="ownerId" label="Assigned to">
        <UserSelect allowClear />
      </Form.Item>
      <Form.Item name="dueDate" label="Due date">
        <DatePicker className="w-full" />
      </Form.Item>
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          type="primary"
          htmlType="submit"
          loading={updateAction.isPending}
        >
          Save
        </Button>
      </div>
    </Form>
  );
}

function scopeLabel(meeting: {
  scope: string | null;
  taskDisciplineName?: string | null;
  designPackageName?: string | null;
}): string {
  if (meeting.scope === 'SUBTASK') {
    return meeting.designPackageName ?? 'Subtask';
  }
  if (meeting.scope === 'DISCIPLINE') {
    return meeting.taskDisciplineName ?? 'Discipline';
  }
  return 'Project-wide';
}

/**
 * Shared meeting detail body used by the full page and the detail drawer.
 */
export default function MeetingDetailContent({
  projectId,
  meetingId,
  variant = 'page',
  onUpdated = () => undefined,
  onDeleted,
}: {
  projectId: string;
  meetingId: string;
  variant?: 'page' | 'drawer';
  onUpdated?: () => void;
  onDeleted?: () => void;
}): React.ReactNode {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editMeetingOpen, setEditMeetingOpen] = useState(false);
  const [minutesDraft, setMinutesDraft] = useState('');
  const [createIssueItem, setCreateIssueItem] = useState<ActionItem | null>(null);
  const [viewActionItem, setViewActionItem] = useState<ActionItem | null>(null);
  const [editActionItem, setEditActionItem] = useState<ActionItem | null>(null);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const resolveUserDisplay = useUserDisplayResolver();
  const messageApi = useAppMessage();
  const modalApi = useAppModal();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const epc = useEpcCapabilities();
  const pm = usePmCapabilities();

  const meetingQuery = useMeeting(projectId, meetingId, true);
  const updateMeeting = useUpdateMeeting();
  const cancelMeeting = useCancelMeeting();
  const deleteMeeting = useDeleteMeeting();
  const removeAttendee = useRemoveMeetingAttendee();
  const updateAction = useUpdateMeetingActionItem();
  const removeAction = useRemoveMeetingActionItem();

  const meeting = meetingQuery.data;
  const canEditMinutes = Boolean(meeting) && ACTIVE_MINUTES_STATUSES.has(meeting!.status);
  const isCancellable = meeting?.status === 'SCHEDULED';
  const isCancelled = meeting?.status === 'CANCELLED';
  const canEdit =
    Boolean(meeting) &&
    !isCancelled &&
    (meeting!.createdBy === currentUserId ||
      pm.projects.canView ||
      epc.navFullAccess);

  const existingUserIds = useMemo(
    () =>
      (meeting?.attendees ?? [])
        .filter((a) => a.attendeeType === 'INTERNAL' && a.userId)
        .map((a) => a.userId as string),
    [meeting?.attendees],
  );

  async function handleSaveMinutes(): Promise<void> {
    try {
      await updateMeeting.mutateAsync({
        projectId,
        meetingId,
        body: { minutes: minutesDraft },
      });
      messageApi.success('Minutes saved');
      onUpdated();
    } catch (error) {
      notifyApiError(error, 'Failed to save minutes', messageApi);
    }
  }

  async function handleCancelMeeting(): Promise<void> {
    try {
      await cancelMeeting.mutateAsync({ projectId, meetingId });
      messageApi.success('Meeting cancelled');
      onUpdated();
    } catch (error) {
      notifyApiError(error, 'Failed to cancel meeting', messageApi);
    }
  }

  async function handleDelete(): Promise<void> {
    try {
      await deleteMeeting.mutateAsync({ projectId, meetingId });
      messageApi.success('Meeting deleted');
      setDeleteOpen(false);
      onUpdated();
      onDeleted?.();
    } catch (error) {
      notifyApiError(error, 'Failed to delete meeting', messageApi);
    }
  }

  function canCreateIssueFromActionItem(item: ActionItem): boolean {
    if (epc.navFullAccess) return true;
    if (meeting?.createdBy && currentUserId === meeting.createdBy) return true;
    if (item.ownerId && currentUserId === item.ownerId) return true;
    return false;
  }

  function confirmRemoveAttendee(record: MeetingAttendee): void {
    const name =
      record.attendeeType === 'INTERNAL'
        ? resolveUserDisplay(record.userId, record.userName)
        : (record.externalName ?? 'attendee');
    modalApi.confirm({
      title: 'Remove attendee',
      content: `Remove ${name} from this meeting?`,
      okText: 'Remove',
      okType: 'danger',
      onOk: () =>
        removeAttendee
          .mutateAsync({
            projectId,
            meetingId,
            attendeeId: record.id,
          })
          .then(() => onUpdated())
          .catch((e: unknown) =>
            notifyApiError(e, 'Failed to remove attendee', messageApi),
          ),
    });
  }

  function confirmDeleteActionItem(record: ActionItem): void {
    modalApi.confirm({
      title: 'Delete action item',
      content:
        'This action item will be permanently removed. Continue?',
      okText: 'Delete',
      okType: 'danger',
      onOk: () =>
        removeAction
          .mutateAsync({
            projectId,
            meetingId,
            actionItemId: record.id,
          })
          .then(() => onUpdated())
          .catch((e: unknown) =>
            notifyApiError(e, 'Failed to delete action item', messageApi),
          ),
    });
  }

  const attendeeColumns: ColumnsType<MeetingAttendee> = [
    {
      title: 'Name',
      key: 'name',
      render: (_: unknown, r: MeetingAttendee) =>
        r.attendeeType === 'INTERNAL'
          ? resolveUserDisplay(r.userId, r.userName)
          : (r.externalName ?? '-'),
    },
    {
      title: 'Company',
      dataIndex: 'organization',
      key: 'organization',
      render: (v: string | null) => v ?? '-',
    },
    {
      title: 'Discipline',
      dataIndex: 'roleAtMeeting',
      key: 'roleAtMeeting',
      render: (v: string | null) => v ?? '-',
    },
    {
      title: 'Type',
      dataIndex: 'attendeeType',
      key: 'attendeeType',
      render: (v: string) => (v === 'INTERNAL' ? 'Internal' : 'External'),
    },
    ...(canEdit
      ? [
          {
            title: '',
            key: 'actions',
            width: 48,
            render: (_: unknown, record: MeetingAttendee) => (
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                onClick={() => confirmRemoveAttendee(record)}
              />
            ),
          },
        ]
      : []),
  ];

  const actionColumns: ColumnsType<ActionItem> = [
    {
      title: 'Title',
      key: 'title',
      ellipsis: true,
      render: (_: unknown, record: ActionItem) => actionItemTitle(record),
    },
    {
      title: 'Assigned to',
      key: 'assignedTo',
      render: (_: unknown, record: ActionItem) =>
        record.ownerId
          ? resolveUserDisplay(record.ownerId, record.ownerName)
          : (record.assignedToName ?? '-'),
    },
    {
      title: 'Due',
      dataIndex: 'dueDate',
      key: 'dueDate',
      render: (v: string | null) => formatProjectDate(v),
    },
    {
      title: 'Status',
      key: 'status',
      width: 100,
      render: (_: unknown, record: ActionItem) => (
        <Checkbox
          checked={record.status === 'CLOSED'}
          disabled={isCancelled}
          onChange={(e) => {
            updateAction.mutate(
              {
                projectId,
                meetingId,
                actionItemId: record.id,
                body: { status: e.target.checked ? 'CLOSED' : 'OPEN' },
              },
              {
                onError: (err: unknown) =>
                  notifyApiError(err, 'Failed to update action item', messageApi),
              },
            );
          }}
        >
          {record.status === 'CLOSED' ? 'Done' : 'Open'}
        </Checkbox>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 220,
      render: (_: unknown, record: ActionItem) => (
        <Space size={0} wrap>
          <Button
            type="link"
            size="small"
            className="!px-1"
            icon={<EyeOutlined />}
            onClick={() => setViewActionItem(record)}
          >
            View
          </Button>
          {record.linkedIssueId ? (
            <span className="inline-flex items-center gap-1">
              <Button
                type="link"
                size="small"
                className="!px-1"
                onClick={() => setSelectedIssueId(record.linkedIssueId)}
              >
                {record.linkedIssueNumber ?? 'Issue'}
              </Button>
              {record.linkedIssueStatus && (
                <span className="shrink-0">
                  <StatusBadge
                    label={formatIssueStatus(record.linkedIssueStatus)}
                    variant={issueStatusVariant(record.linkedIssueStatus)}
                  />
                </span>
              )}
            </span>
          ) : canCreateIssueFromActionItem(record) ? (
            <Button
              type="link"
              size="small"
              className="!px-1"
              onClick={() => setCreateIssueItem(record)}
            >
              Create Issue
            </Button>
          ) : null}
          {canEdit && (
            <>
              <Button
                type="link"
                size="small"
                className="!px-1"
                icon={<EditOutlined />}
                onClick={() => setEditActionItem(record)}
              >
                Edit
              </Button>
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                onClick={() => confirmDeleteActionItem(record)}
              />
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      {meetingQuery.isLoading && (
        <div className="flex flex-col gap-3">
          <div className="erp-page-skeleton h-10 w-full rounded" />
          <div className="erp-page-skeleton h-10 w-full rounded" />
          <div className="erp-page-skeleton h-32 w-full rounded" />
        </div>
      )}
      {meetingQuery.isError && (
        <p className={layout.drawerMutedText}>
          {meetingQuery.error instanceof ApiRequestError
            ? meetingQuery.error.message
            : 'Unable to load meeting.'}
        </p>
      )}
      {meeting && (
        <div className={layout.drawerStack}>
          {isCancelled && (
            <Alert
              type="error"
              showIcon
              title="This meeting has been cancelled"
              description="No further changes can be made."
            />
          )}

          <section className={layout.drawerSection}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className={layout.drawerHeading}>Meeting info</h3>
              <Space size="small">
                {canEdit && (
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => setEditMeetingOpen(true)}
                  >
                    Edit
                  </Button>
                )}
                {isCancellable && (
                  <Button danger size="small" onClick={() => setDeleteOpen(true)}>
                    Delete
                  </Button>
                )}
              </Space>
            </div>
            <Descriptions
              className={layout.drawerDescriptionsClass}
              column={variant === 'drawer' ? 1 : { xs: 1, sm: 2 }}
              size="small"
              bordered
            >
              <Descriptions.Item label="Meeting date">
                {formatProjectDate(meeting.meetingDate)}
              </Descriptions.Item>
              {(meeting.startTime || meeting.endTime) && (
                <Descriptions.Item label="Time">
                  {meeting.startTime ?? '-'} – {meeting.endTime ?? '-'}
                </Descriptions.Item>
              )}
              {meeting.location && (
                <Descriptions.Item label="Location">
                  {meeting.location}
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Scope">
                {scopeLabel(meeting)}
              </Descriptions.Item>
              <Descriptions.Item label="Created by">
                {resolveUserDisplay(meeting.createdBy, meeting.organizerName)}
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                <StatusBadge
                  label={formatMeetingStatus(meeting.status)}
                  variant={meetingStatusVariant(meeting.status)}
                />
              </Descriptions.Item>
            </Descriptions>
          </section>

          {meeting.agenda && (
            <section className={layout.drawerSection}>
              <h3 className={`${layout.drawerHeading} mb-2`}>Agenda</h3>
              <div className={layout.drawerSurface}>
                <p className="whitespace-pre-wrap">{meeting.agenda}</p>
              </div>
            </section>
          )}

          <section className={layout.drawerSection}>
            <h3 className={`${layout.drawerHeading} mb-3`}>Attendees</h3>
            <DataTable
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={meeting.attendees}
              columns={attendeeColumns}
              locale={{ emptyText: 'No attendees yet' }}
            />
            {!isCancelled && canEdit && (
              <AddAttendeeForm
                projectId={projectId}
                meetingId={meeting.id}
                existingUserIds={existingUserIds}
                onAdded={onUpdated}
              />
            )}
          </section>

          <section className={layout.drawerSection}>
            <h3 className={`${layout.drawerHeading} mb-3`}>Minutes</h3>
            <Input.TextArea
              rows={5}
              defaultValue={meeting.minutes ?? ''}
              disabled={!canEditMinutes}
              placeholder="Record meeting minutes here"
              onChange={(e) => setMinutesDraft(e.target.value)}
            />
            {canEditMinutes && (
              <Button
                type="primary"
                className="!mt-2"
                loading={updateMeeting.isPending}
                onClick={() => void handleSaveMinutes()}
              >
                Save minutes
              </Button>
            )}
          </section>

          <section className={layout.drawerSection}>
            <h3 className={`${layout.drawerHeading} mb-3`}>Action items</h3>
            <DataTable
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={meeting.actionItems}
              columns={actionColumns}
              locale={{ emptyText: 'No action items' }}
            />
            {!isCancelled && canEdit && (
              <AddActionItemForm
                projectId={projectId}
                meetingId={meeting.id}
                onAdded={onUpdated}
              />
            )}
          </section>

          <section className={layout.drawerSection}>
            <h3 className={`${layout.drawerHeading} mb-3`}>Attachments</h3>
            <DocumentAttachmentPanel
              folderId={meeting.attachmentFolderId ?? undefined}
              readOnly={isCancelled}
              title=""
              description="Minutes, presentations, and supporting files."
            />
          </section>

          {isCancellable && (
            <div className="flex justify-end">
              <Button
                danger
                loading={cancelMeeting.isPending}
                onClick={() => void handleCancelMeeting()}
              >
                Cancel meeting
              </Button>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={deleteOpen}
        title="Delete meeting?"
        description="This will remove the meeting and all attendee and action item records."
        confirmLabel="Delete"
        danger
        confirmLoading={deleteMeeting.isPending}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteOpen(false)}
      />

      {meeting && (
        <EditMeetingModal
          open={editMeetingOpen}
          projectId={projectId}
          meeting={meeting}
          onClose={() => setEditMeetingOpen(false)}
          onSaved={onUpdated}
        />
      )}

      <ActionItemViewModal
        open={Boolean(viewActionItem)}
        item={viewActionItem}
        resolveUserDisplay={resolveUserDisplay}
        onClose={() => setViewActionItem(null)}
        onOpenIssue={(issueId) => {
          setViewActionItem(null);
          setSelectedIssueId(issueId);
        }}
      />

      <ActionItemEditModal
        open={Boolean(editActionItem)}
        projectId={projectId}
        meetingId={meetingId}
        item={editActionItem}
        onClose={() => setEditActionItem(null)}
        onSaved={onUpdated}
      />

      <CreateIssueFromActionItemModal
        projectId={projectId}
        meetingId={meetingId}
        actionItem={createIssueItem}
        onClose={() => setCreateIssueItem(null)}
        onCreated={onUpdated}
      />

      <IssueDetailDrawer
        projectId={projectId}
        issueId={selectedIssueId}
        onClose={() => setSelectedIssueId(null)}
        onUpdated={onUpdated}
      />
    </>
  );
}
