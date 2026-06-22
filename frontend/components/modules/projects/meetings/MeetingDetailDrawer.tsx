'use client';

import { useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  Collapse,
  DatePicker,
  Divider,
  Drawer,
  Form,
  Input,
  Select,
  Spin,
  Tabs,
} from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DataTable from '@/components/ui/DataTable/DataTable';
import DocumentAttachmentPanel from '@/components/ui/DocumentAttachmentPanel/DocumentAttachmentPanel';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import UserSelect from '@/components/ui/UserSelect/UserSelect';
import WorkflowStepper from '@/components/ui/WorkflowStepper/WorkflowStepper';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  ActionItem,
  MeetingAgendaItem,
  MeetingAttendee,
  MeetingStatus,
} from '@/lib/api/project-management.types';
import { MEETING_WORKFLOW } from '@/lib/api/workflow';
import { useUserNameLookup } from '@/hooks/useUserNameLookup';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  useAddMeetingActionItem,
  useAddMeetingAgendaItem,
  useAddMeetingAttendee,
  useDeleteMeeting,
  useMeeting,
  useRemoveMeetingActionItem,
  useRemoveMeetingAgendaItem,
  useRemoveMeetingAttendee,
  useUpdateMeeting,
  useUpdateMeetingActionItem,
  useUpdateMeetingAttendee,
} from '@/lib/query/meetings';
import { antDrawerBodyStylesMd, layout } from '@/lib/theme/layout';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatMeetingStatus,
  meetingStatusVariant,
} from '@/lib/utils/pm-status-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';

function AddCollapse({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <Collapse
      ghost
      className="!mt-2"
      items={[
        {
          key: 'add',
          label: <span className="text-sm font-medium text-orange-600">{label}</span>,
          children: <div className="pt-1">{children}</div>,
        },
      ]}
    />
  );
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
  const [activeTab, setActiveTab] = useState('overview');
  const open = Boolean(meetingId);
  const resolveUserName = useUserNameLookup();
  const messageApi = useAppMessage();

  const meetingQuery = useMeeting(projectId, meetingId ?? '', open);
  const updateMeeting = useUpdateMeeting();
  const deleteMeeting = useDeleteMeeting();
  const addAgenda = useAddMeetingAgendaItem();
  const removeAgenda = useRemoveMeetingAgendaItem();
  const addAttendee = useAddMeetingAttendee();
  const updateAttendee = useUpdateMeetingAttendee();
  const removeAttendee = useRemoveMeetingAttendee();
  const addAction = useAddMeetingActionItem();
  const updateAction = useUpdateMeetingActionItem();
  const removeAction = useRemoveMeetingActionItem();

  const meeting = meetingQuery.data;
  const isEditable =
    meeting?.status === 'SCHEDULED' || meeting?.status === 'CONDUCTED';

  async function handleStatusChange(status: MeetingStatus): Promise<void> {
    if (!meetingId) return;
    try {
      await updateMeeting.mutateAsync({ projectId, meetingId, body: { status } });
      messageApi.success('Meeting status updated');
      onUpdated();
      void meetingQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to update status', messageApi);
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

  const agendaColumns: ColumnsType<MeetingAgendaItem> = [
    { title: '#', dataIndex: 'itemOrder', key: 'itemOrder', width: 48 },
    { title: 'Topic', dataIndex: 'topic', key: 'topic' },
    {
      title: 'Presenter',
      dataIndex: 'presenterId',
      key: 'presenterId',
      render: (id: string | null) => (id ? resolveUserName(id) : '—'),
    },
    ...(isEditable
      ? [
          {
            title: '',
            key: 'actions',
            width: 48,
            render: (_: unknown, record: MeetingAgendaItem) => (
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                onClick={() =>
                  void removeAgenda
                    .mutateAsync({
                      projectId,
                      meetingId: meetingId!,
                      agendaItemId: record.id,
                    })
                    .then(() => void meetingQuery.refetch())
                    .catch((e: unknown) =>
                      notifyApiError(e, 'Failed to remove item', messageApi),
                    )
                }
              />
            ),
          },
        ]
      : []),
  ];

  const attendeeColumns: ColumnsType<MeetingAttendee> = [
    {
      title: 'Name',
      key: 'name',
      render: (_: unknown, r: MeetingAttendee) =>
        r.userId ? resolveUserName(r.userId) : (r.externalName ?? '—'),
    },
    {
      title: 'Organization',
      dataIndex: 'organization',
      key: 'organization',
      render: (v: string | null) => v ?? '—',
    },
    {
      title: 'Role',
      dataIndex: 'roleAtMeeting',
      key: 'roleAtMeeting',
      render: (v: string | null) => v ?? '—',
    },
    {
      title: 'Attended',
      dataIndex: 'attended',
      key: 'attended',
      render: (attended: boolean, record: MeetingAttendee) => (
        <Checkbox
          checked={attended}
          disabled={!isEditable}
          onChange={(e) =>
            void updateAttendee
              .mutateAsync({
                projectId,
                meetingId: meetingId!,
                attendeeId: record.id,
                body: { attended: e.target.checked },
              })
              .then(() => void meetingQuery.refetch())
          }
        />
      ),
    },
    ...(isEditable
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
                    .then(() => void meetingQuery.refetch())
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
      title: 'Owner',
      dataIndex: 'ownerId',
      key: 'ownerId',
      render: (id: string) => resolveUserName(id),
    },
    {
      title: 'Due',
      dataIndex: 'dueDate',
      key: 'dueDate',
      render: (v: string | null) => formatProjectDate(v),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string, record: ActionItem) =>
        isEditable ? (
          <Select
            size="small"
            value={status}
            className="min-w-[100px]"
            options={[
              { value: 'OPEN', label: 'Open' },
              { value: 'CLOSED', label: 'Closed' },
            ]}
            onChange={(value: string) =>
              void updateAction.mutateAsync({
                projectId,
                meetingId: meetingId!,
                actionItemId: record.id,
                body: { status: value },
              }).then(() => void meetingQuery.refetch())
            }
          />
        ) : (
          status
        ),
    },
    ...(isEditable
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
                  void removeAction.mutateAsync({
                    projectId,
                    meetingId: meetingId!,
                    actionItemId: record.id,
                  }).then(() => void meetingQuery.refetch())
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
        open={open}
        onClose={onClose}
        title={meeting ? `${meeting.meetingNumber} — ${meeting.title}` : 'Meeting'}
        size="large"
        className="erp-responsive-drawer"
        styles={antDrawerBodyStylesMd}
        destroyOnHidden
        extra={
          meeting && isEditable ? (
            <Button danger onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
          ) : undefined
        }
      >
        {meetingQuery.isLoading && (
          <div className="flex justify-center py-16">
            <Spin />
          </div>
        )}
        {meetingQuery.isError && (
          <p className="text-sm text-slate-500">
            {meetingQuery.error instanceof ApiRequestError
              ? meetingQuery.error.message
              : 'Unable to load meeting.'}
          </p>
        )}
        {meeting && (
          <div className={layout.drawerStack}>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase text-slate-500">
                    {meeting.meetingType.replace(/_/g, ' ')}
                  </p>
                  <p className="mt-1 text-sm text-slate-900">
                    {formatProjectDate(meeting.meetingDate)}
                    {meeting.location ? ` · ${meeting.location}` : ''}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Organizer: {resolveUserName(meeting.organizerId)}
                  </p>
                </div>
                <div className="w-full max-w-xs">
                  <StatusBadge
                    label={formatMeetingStatus(meeting.status)}
                    variant={meetingStatusVariant(meeting.status)}
                  />
                  <Select
                    className="mt-2 w-full"
                    value={meeting.status}
                    onChange={(v: MeetingStatus) => void handleStatusChange(v)}
                    options={MEETING_WORKFLOW.map((s) => ({
                      value: s.key,
                      label: s.label,
                    }))}
                  />
                </div>
              </div>
            </div>

            <WorkflowStepper
              steps={MEETING_WORKFLOW}
              currentStatus={meeting.status}
            />

            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              destroyOnHidden
              items={[
                {
                  key: 'agenda',
                  label: (
                    <span className="inline-flex items-center gap-2">
                      Agenda
                      {meeting.agendaItems.length > 0 && (
                        <Badge count={meeting.agendaItems.length} size="small" color="#F47B20" />
                      )}
                    </span>
                  ),
                  children: (
                    <div className="space-y-4">
                      <DataTable
                        size="small"
                        rowKey="id"
                        pagination={false}
                        dataSource={meeting.agendaItems}
                        columns={agendaColumns}
                        locale={{ emptyText: 'No agenda items' }}
                      />
                      {isEditable && (
                        <AddCollapse label="Add agenda item">
                          <Form
                            layout="vertical"
                            className="erp-drawer-form"
                            onFinish={(values: {
                              topic: string;
                              presenterId?: string;
                              discussionNotes?: string;
                            }) =>
                              void addAgenda
                                .mutateAsync({
                                  projectId,
                                  meetingId: meeting.id,
                                  body: {
                                    topic: values.topic.trim(),
                                    presenterId: values.presenterId,
                                    discussionNotes:
                                      values.discussionNotes?.trim(),
                                  },
                                })
                                .then(() => {
                                  messageApi.success('Agenda item added');
                                  void meetingQuery.refetch();
                                })
                                .catch((e: unknown) =>
                                  notifyApiError(e, 'Failed to add item', messageApi),
                                )
                            }
                          >
                            <Form.Item
                              name="topic"
                              label="Topic"
                              rules={[{ required: true }]}
                            >
                              <Input />
                            </Form.Item>
                            <Form.Item name="presenterId" label="Presenter">
                              <UserSelect allowClear />
                            </Form.Item>
                            <Form.Item name="discussionNotes" label="Notes">
                              <Input.TextArea rows={2} />
                            </Form.Item>
                            <Button type="primary" htmlType="submit" icon={<PlusOutlined />}>
                              Add item
                            </Button>
                          </Form>
                        </AddCollapse>
                      )}
                    </div>
                  ),
                },
                {
                  key: 'attendees',
                  label: (
                    <span className="inline-flex items-center gap-2">
                      Attendees
                      {meeting.attendees.length > 0 && (
                        <Badge count={meeting.attendees.length} size="small" color="#F47B20" />
                      )}
                    </span>
                  ),
                  children: (
                    <div className="space-y-4">
                      <DataTable
                        size="small"
                        rowKey="id"
                        pagination={false}
                        dataSource={meeting.attendees}
                        columns={attendeeColumns}
                        locale={{ emptyText: 'No attendees' }}
                      />
                      {isEditable && (
                        <AddCollapse label="Add attendee">
                          <Form
                            layout="vertical"
                            className="erp-drawer-form"
                            onFinish={(values: {
                              userId?: string;
                              externalName?: string;
                              organization?: string;
                              roleAtMeeting?: string;
                            }) =>
                              void addAttendee
                                .mutateAsync({
                                  projectId,
                                  meetingId: meeting.id,
                                  body: values,
                                })
                                .then(() => {
                                  messageApi.success('Attendee added');
                                  void meetingQuery.refetch();
                                })
                            }
                          >
                            <Form.Item name="userId" label="User (internal)">
                              <UserSelect allowClear />
                            </Form.Item>
                            <Form.Item name="externalName" label="External name">
                              <Input placeholder="If not a system user" />
                            </Form.Item>
                            <div className="grid gap-4 sm:grid-cols-2">
                              <Form.Item name="organization" label="Organization">
                                <Input />
                              </Form.Item>
                              <Form.Item name="roleAtMeeting" label="Role">
                                <Input placeholder="Chair, observer…" />
                              </Form.Item>
                            </div>
                            <Button type="primary" htmlType="submit" icon={<PlusOutlined />}>
                              Add attendee
                            </Button>
                          </Form>
                        </AddCollapse>
                      )}
                    </div>
                  ),
                },
                {
                  key: 'actions',
                  label: (
                    <span className="inline-flex items-center gap-2">
                      Action items
                      {meeting.actionItems.length > 0 && (
                        <Badge count={meeting.actionItems.length} size="small" color="#F47B20" />
                      )}
                    </span>
                  ),
                  children: (
                    <div className="space-y-4">
                      <DataTable
                        size="small"
                        rowKey="id"
                        pagination={false}
                        dataSource={meeting.actionItems}
                        columns={actionColumns}
                        locale={{ emptyText: 'No action items' }}
                      />
                      {isEditable && (
                        <AddCollapse label="Add action item">
                          <Form
                            layout="vertical"
                            className="erp-drawer-form"
                            onFinish={(values: {
                              ownerId: string;
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
                                  void meetingQuery.refetch();
                                })
                            }
                          >
                            <Form.Item
                              name="ownerId"
                              label="Owner"
                              rules={[{ required: true }]}
                            >
                              <UserSelect />
                            </Form.Item>
                            <Form.Item
                              name="description"
                              label="Description"
                              rules={[{ required: true }]}
                            >
                              <Input.TextArea rows={2} />
                            </Form.Item>
                            <Form.Item name="dueDate" label="Due date">
                              <DatePicker className="w-full" />
                            </Form.Item>
                            <Button type="primary" htmlType="submit" icon={<PlusOutlined />}>
                              Add action item
                            </Button>
                          </Form>
                        </AddCollapse>
                      )}
                    </div>
                  ),
                },
                {
                  key: 'attachments',
                  label: 'Attachments',
                  children: (
                    <DocumentAttachmentPanel
                      folderId={meeting.attachmentFolderId ?? undefined}
                      readOnly={!isEditable}
                      title="Meeting documents"
                      description="Minutes, presentations, and supporting files."
                    />
                  ),
                },
              ]}
            />
            <Divider className="!my-0" />
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete meeting?"
        description="This will remove the meeting and all agenda, attendee, and action item records."
        confirmLabel="Delete"
        danger
        confirmLoading={deleteMeeting.isPending}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteOpen(false)}
      />
    </>
  );
}
