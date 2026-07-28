'use client';

import { useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
  Radio,
} from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DataTable from '@/components/ui/DataTable/DataTable';
import DocumentAttachmentPanel from '@/components/ui/DocumentAttachmentPanel/DocumentAttachmentPanel';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import UserSelect from '@/components/ui/UserSelect/UserSelect';
import type {
  ActionItem,
  MeetingAttendee,
} from '@/lib/api/project-management.types';
import { useUserDisplayResolver } from '@/hooks/useUserNameLookup';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  useAddMeetingActionItem,
  useAddMeetingAttendee,
  useCancelMeeting,
  useCreateIssueFromActionItem,
  useDeleteMeeting,
  useMeeting,
  useRemoveMeetingActionItem,
  useRemoveMeetingAttendee,
  useUpdateMeeting,
  useUpdateMeetingActionItem,
} from '@/lib/query/meetings';
import { layout, wideDetailDrawerProps } from '@/lib/theme/layout';
import { ApiRequestError } from '@/lib/api/errors';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatMeetingStatus,
  meetingStatusVariant,
} from '@/lib/utils/pm-status-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const ACTIVE_MINUTES_STATUSES = new Set(['SCHEDULED', 'IN_PROGRESS', 'CONDUCTED']);

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

export default function MeetingDetailDrawer({
  projectId,
  meetingId,
  onClose,
  onUpdated,
}: {
  projectId: string;
  meetingId: string | null;
  onClose: () => void;
  onUpdated: () => void;
}): React.ReactNode {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [attendeeType, setAttendeeType] = useState<'INTERNAL' | 'EXTERNAL'>('INTERNAL');
  const [minutesDraft, setMinutesDraft] = useState('');
  const open = Boolean(meetingId);
  const resolveUserDisplay = useUserDisplayResolver();
  const messageApi = useAppMessage();

  const meetingQuery = useMeeting(projectId, meetingId ?? '', open);
  const updateMeeting = useUpdateMeeting();
  const cancelMeeting = useCancelMeeting();
  const deleteMeeting = useDeleteMeeting();
  const addAttendee = useAddMeetingAttendee();
  const removeAttendee = useRemoveMeetingAttendee();
  const addAction = useAddMeetingActionItem();
  const updateAction = useUpdateMeetingActionItem();
  const removeAction = useRemoveMeetingActionItem();
  const createIssueFromAction = useCreateIssueFromActionItem();

  const meeting = meetingQuery.data;
  const canEditMinutes = Boolean(meeting) && ACTIVE_MINUTES_STATUSES.has(meeting!.status);
  const isCancellable = meeting?.status === 'SCHEDULED';
  const isCancelled = meeting?.status === 'CANCELLED';

  const [attendeeForm] = Form.useForm();
  const [actionForm] = Form.useForm();

  async function handleSaveMinutes(): Promise<void> {
    if (!meetingId) return;
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
    if (!meetingId) return;
    try {
      await cancelMeeting.mutateAsync({ projectId, meetingId });
      messageApi.success('Meeting cancelled');
      onUpdated();
    } catch (error) {
      notifyApiError(error, 'Failed to cancel meeting', messageApi);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!meetingId) return;
    try {
      await deleteMeeting.mutateAsync({ projectId, meetingId });
      messageApi.success('Meeting deleted');
      setDeleteOpen(false);
      onUpdated();
      onClose();
    } catch (error) {
      notifyApiError(error, 'Failed to delete meeting', messageApi);
    }
  }

  function handleCreateIssue(item: ActionItem): void {
    if (!meetingId) return;
    Modal.confirm({
      title: 'Create an Issue from this action item?',
      content: item.description,
      okText: 'Create',
      cancelText: 'Cancel',
      onOk: () =>
        createIssueFromAction
          .mutateAsync({ projectId, meetingId, actionItemId: item.id })
          .then(() => {
            messageApi.success('Issue created and linked');
            onUpdated();
          })
          .catch((error: unknown) =>
            notifyApiError(error, 'Failed to create issue', messageApi),
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
      title: 'Role',
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
    ...(!isCancelled
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
                onClick={() =>
                  void removeAttendee
                    .mutateAsync({
                      projectId,
                      meetingId: meetingId!,
                      attendeeId: record.id,
                    })
                    .then(() => onUpdated())
                    .catch((e: unknown) =>
                      notifyApiError(e, 'Failed to remove attendee', messageApi),
                    )
                }
              />
            ),
          },
        ]
      : []),
  ];

  const actionColumns: ColumnsType<ActionItem> = [
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
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
      width: 90,
      render: (_: unknown, record: ActionItem) => (
        <Checkbox
          checked={record.status === 'CLOSED'}
          disabled={isCancelled}
          onChange={(e) =>
            void updateAction
              .mutateAsync({
                projectId,
                meetingId: meetingId!,
                actionItemId: record.id,
                body: { status: e.target.checked ? 'CLOSED' : 'OPEN' },
              })
              .then(() => onUpdated())
              .catch((err: unknown) =>
                notifyApiError(err, 'Failed to update action item', messageApi),
              )
          }
        >
          {record.status === 'CLOSED' ? 'Done' : 'Open'}
        </Checkbox>
      ),
    },
    {
      title: 'Issue',
      key: 'issue',
      render: (_: unknown, record: ActionItem) =>
        record.linkedIssueId ? (
          <span>{record.linkedIssueNumber ?? record.linkedIssueId}</span>
        ) : (
          <Button
            type="link"
            className="!px-0"
            loading={createIssueFromAction.isPending}
            onClick={() => handleCreateIssue(record)}
          >
            Create Issue →
          </Button>
        ),
    },
    ...(!isCancelled
      ? [
          {
            title: '',
            key: 'actions',
            width: 48,
            render: (_: unknown, record: ActionItem) => (
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                onClick={() =>
                  void removeAction
                    .mutateAsync({
                      projectId,
                      meetingId: meetingId!,
                      actionItemId: record.id,
                    })
                    .then(() => onUpdated())
                }
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <Drawer
        {...wideDetailDrawerProps}
        open={open}
        onClose={onClose}
        title={
          meeting ? (
            <span className="flex flex-wrap items-center gap-2">
              {meeting.meetingNumber} — {meeting.title}
              <StatusBadge
                label={formatMeetingStatus(meeting.status)}
                variant={meetingStatusVariant(meeting.status)}
              />
            </span>
          ) : (
            'Meeting'
          )
        }
        destroyOnHidden
        extra={
          meeting && isCancellable ? (
            <Button danger onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
          ) : undefined
        }
      >
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

            <Descriptions
              className={layout.drawerDescriptionsClass}
              column={1}
              size="small"
              bordered
            >
              <Descriptions.Item label="Meeting date">
                {formatProjectDate(meeting.meetingDate)}
              </Descriptions.Item>
              {(meeting.startTime || meeting.endTime) && (
                <Descriptions.Item label="Time">
                  {meeting.startTime ?? '—'} – {meeting.endTime ?? '—'}
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
              {!isCancelled && (
                <Form
                  form={attendeeForm}
                  layout="vertical"
                  className="erp-drawer-form !mt-3"
                  onFinish={(values: {
                    userId?: string;
                    externalName?: string;
                    organization?: string;
                    roleAtMeeting?: string;
                    email?: string;
                  }) =>
                    void addAttendee
                      .mutateAsync({
                        projectId,
                        meetingId: meeting.id,
                        body: { attendeeType, ...values },
                      })
                      .then(() => {
                        messageApi.success('Attendee added');
                        attendeeForm.resetFields();
                        onUpdated();
                      })
                      .catch((e: unknown) =>
                        notifyApiError(e, 'Failed to add attendee', messageApi),
                      )
                  }
                >
                  <Radio.Group
                    className="!mb-2"
                    value={attendeeType}
                    onChange={(e) => setAttendeeType(e.target.value)}
                  >
                    <Radio value="INTERNAL">Internal</Radio>
                    <Radio value="EXTERNAL">External</Radio>
                  </Radio.Group>
                  {attendeeType === 'INTERNAL' ? (
                    <Form.Item
                      name="userId"
                      label="Project team member"
                      rules={[{ required: true, message: 'Select a user' }]}
                    >
                      <UserSelect />
                    </Form.Item>
                  ) : (
                    <Form.Item
                      name="externalName"
                      label="Name"
                      rules={[{ required: true, message: 'Name is required' }]}
                    >
                      <Input placeholder="Eng. Yohannes" />
                    </Form.Item>
                  )}
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Form.Item name="organization" label="Company">
                      <Input />
                    </Form.Item>
                    <Form.Item name="roleAtMeeting" label="Role">
                      <Input placeholder="Structural reviewer" />
                    </Form.Item>
                    {attendeeType === 'EXTERNAL' && (
                      <Form.Item name="email" label="Email">
                        <Input type="email" />
                      </Form.Item>
                    )}
                  </div>
                  <Button
                    type="primary"
                    htmlType="submit"
                    icon={<PlusOutlined />}
                    loading={addAttendee.isPending}
                  >
                    Add attendee
                  </Button>
                </Form>
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
              {!isCancelled && (
                <Form
                  form={actionForm}
                  layout="vertical"
                  className="erp-drawer-form !mt-3"
                  onFinish={(values: {
                    ownerId?: string;
                    description: string;
                    dueDate?: Dayjs;
                  }) =>
                    void addAction
                      .mutateAsync({
                        projectId,
                        meetingId: meeting.id,
                        body: {
                          ownerId: values.ownerId,
                          description: values.description.trim(),
                          dueDate: values.dueDate?.format('YYYY-MM-DD'),
                        },
                      })
                      .then(() => {
                        messageApi.success('Action item added');
                        actionForm.resetFields();
                        onUpdated();
                      })
                      .catch((e: unknown) =>
                        notifyApiError(e, 'Failed to add action item', messageApi),
                      )
                  }
                >
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
      </Drawer>

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
    </>
  );
}
