'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  DatePicker,
  Empty,
  Form,
  Input,
  Modal,
  Skeleton,
  Space,
  Table,
  TimePicker,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import {
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import FileUploadInput from '@/components/ui/FileUploadInput/FileUploadInput';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { ApiRequestError } from '@/lib/api/errors';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import type {
  OvertimeEntry,
  UpsertOvertimeEntryPayload,
} from '@/lib/api/overtime.types';
import {
  useAddOvertimeEntry,
  useCancelOvertimeSheet,
  useDeleteOvertimeEntry,
  useOvertimeSheet,
  useSubmitOvertimeSheet,
  useUpdateOvertimeEntry,
  useUploadOvertimeEntryAttachments,
} from '@/lib/query/overtime';
import { useApprovalRequest } from '@/lib/query/approvals';
import { useCurrentUser } from '@/lib/query/profile';
import {
  formatOvertimeEmployeeName,
  formatOvertimeHours,
  formatOvertimePeriod,
  formatOvertimeStatus,
  overtimeStatusVariant,
} from '@/lib/utils/overtime-display';
import {
  calculateOvertimeHours,
  parseOvertimeDateOnly,
} from '@/lib/utils/overtime-hours.util';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

interface EntryFormValues {
  date: Dayjs;
  startTime: Dayjs;
  endTime: Dayjs;
  isHoliday: boolean;
  taskDescription: string;
}

function HoursSummaryCards({
  regular,
  night,
  weekend,
  holiday,
  total,
}: {
  regular: number;
  night: number;
  weekend: number;
  holiday: number;
  total: number;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  return (
    <SummaryStrip
      items={[
        {
          label: t('hr.overtimeCategory.regular'),
          value: `${formatOvertimeHours(regular)} hrs`,
        },
        {
          label: t('hr.overtimeCategory.night'),
          value: `${formatOvertimeHours(night)} hrs`,
        },
        {
          label: t('hr.overtimeCategory.weekend'),
          value: `${formatOvertimeHours(weekend)} hrs`,
        },
        {
          label: t('hr.overtimeCategory.holiday'),
          value: `${formatOvertimeHours(holiday)} hrs`,
        },
        {
          label: t('hr.overtimeCategory.total'),
          value: `${formatOvertimeHours(total)} hrs`,
          emphasize: true,
        },
      ]}
    />
  );
}

/**
 * Monthly overtime sheet detail — editable entries when DRAFT/RETURNED.
 */
export default function OvertimeSheetDetailPageContent({
  sheetId,
}: {
  sheetId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const canViewHr = useCanViewHr();
  const currentUser = useCurrentUser();
  const detailQuery = useOvertimeSheet(sheetId);
  const addMutation = useAddOvertimeEntry(sheetId);
  const updateMutation = useUpdateOvertimeEntry(sheetId);
  const deleteMutation = useDeleteOvertimeEntry(sheetId);
  const uploadAttachmentsMutation = useUploadOvertimeEntryAttachments(sheetId);
  const submitMutation = useSubmitOvertimeSheet(sheetId);
  const cancelMutation = useCancelOvertimeSheet(sheetId);

  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<OvertimeEntry | null>(null);
  const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null);
  const [entryFiles, setEntryFiles] = useState<Record<string, File[]>>(
    {},
  );
  const [form] = Form.useForm<EntryFormValues>();

  const sheet = detailQuery.data;
  const approvalRequestId = sheet?.approvalRequestId ?? null;
  const approvalQuery = useApprovalRequest(
    approvalRequestId ?? '',
    Boolean(approvalRequestId) &&
      !(sheet?.approvalRequest?.tiers && sheet.approvalRequest.tiers.length > 0),
  );
  const approvalRequest =
    sheet?.approvalRequest?.tiers && sheet.approvalRequest.tiers.length > 0
      ? sheet.approvalRequest
      : (approvalQuery.data ?? sheet?.approvalRequest ?? null);
  const tiers = useMemo(
    () => (approvalRequest?.tiers ?? []) as ApprovalTier[],
    [approvalRequest?.tiers],
  );

  const isOwner =
    Boolean(sheet) &&
    Boolean(currentUser.data?.id) &&
    sheet?.employeeId === currentUser.data?.id;

  useEffect(() => {
    if (canViewHr || detailQuery.isLoading) {
      return;
    }

    if (
      detailQuery.isError &&
      detailQuery.error instanceof ApiRequestError &&
      (detailQuery.error.status === 403 || detailQuery.error.status === 404)
    ) {
      router.replace('/approvals');
      return;
    }

    if (
      sheet &&
      currentUser.data?.id &&
      sheet.employeeId !== currentUser.data.id
    ) {
      router.replace('/approvals');
    }
  }, [
    canViewHr,
    currentUser.data?.id,
    detailQuery.error,
    detailQuery.isError,
    detailQuery.isLoading,
    router,
    sheet,
  ]);

  const canEdit =
    isOwner && (sheet?.status === 'DRAFT' || sheet?.status === 'RETURNED');
  const canCancel =
    isOwner &&
    (sheet?.status === 'DRAFT' || sheet?.status === 'SUBMITTED');
  const canSubmit = canEdit && (sheet?.entries?.length ?? 0) > 0;

  const watchedDate = Form.useWatch('date', form);
  const watchedStart = Form.useWatch('startTime', form);
  const watchedEnd = Form.useWatch('endTime', form);
  const watchedHoliday = Form.useWatch('isHoliday', form);

  const liveHours = useMemo(() => {
    if (!watchedDate || !watchedStart || !watchedEnd) {
      return null;
    }
    const date = parseOvertimeDateOnly(watchedDate.format('YYYY-MM-DD'));
    if (!date) {
      return null;
    }
    return calculateOvertimeHours(
      date,
      watchedStart.format('HH:mm'),
      watchedEnd.format('HH:mm'),
      Boolean(watchedHoliday),
    );
  }, [watchedDate, watchedStart, watchedEnd, watchedHoliday]);

  useEffect(() => {
    if (!entryModalOpen) {
      return;
    }
    if (editingEntry) {
      form.setFieldsValue({
        date: dayjs(editingEntry.date),
        startTime: dayjs(editingEntry.startTime, 'HH:mm'),
        endTime: dayjs(editingEntry.endTime, 'HH:mm'),
        isHoliday: editingEntry.isHoliday,
        taskDescription: editingEntry.taskDescription,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({
        isHoliday: false,
        date: dayjs(
          `${sheet?.year ?? dayjs().year()}-${String(sheet?.month ?? dayjs().month() + 1).padStart(2, '0')}-01`,
        ),
      });
    }
  }, [entryModalOpen, editingEntry, form, sheet?.month, sheet?.year]);

  function openAddEntry(): void {
    setEditingEntry(null);
    setEntryModalOpen(true);
  }

  function openEditEntry(entry: OvertimeEntry): void {
    setEditingEntry(entry);
    setEntryModalOpen(true);
  }

  async function handleSaveEntry(): Promise<void> {
    try {
      const values = await form.validateFields();
      const payload: UpsertOvertimeEntryPayload = {
        date: values.date.format('YYYY-MM-DD'),
        startTime: values.startTime.format('HH:mm'),
        endTime: values.endTime.format('HH:mm'),
        isHoliday: Boolean(values.isHoliday),
        taskDescription: values.taskDescription.trim(),
      };

      if (editingEntry) {
        await updateMutation.mutateAsync({
          entryId: editingEntry.id,
          payload,
        });
        messageApi.success('Entry updated');
      } else {
        await addMutation.mutateAsync(payload);
        messageApi.success('Entry added');
      }
      setEntryModalOpen(false);
      setEditingEntry(null);
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'errorFields' in error) {
        return;
      }
      notifyApiError(error, 'Failed to save entry', messageApi);
    }
  }

  async function handleDeleteEntry(): Promise<void> {
    if (!deleteEntryId) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(deleteEntryId);
      messageApi.success('Entry deleted');
      setDeleteEntryId(null);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to delete entry', messageApi);
    }
  }

  async function handleSubmit(): Promise<void> {
    try {
      await submitMutation.mutateAsync();
      messageApi.success('Overtime sheet submitted for approval');
      setConfirmSubmit(false);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to submit sheet', messageApi);
    }
  }

  async function handleCancel(): Promise<void> {
    try {
      await cancelMutation.mutateAsync();
      messageApi.success('Overtime sheet cancelled');
      setConfirmCancel(false);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to cancel sheet', messageApi);
    }
  }

  async function handleUploadEntryFiles(entryId: string): Promise<void> {
    const files = entryFiles[entryId] ?? [];
    if (files.length === 0) {
      messageApi.warning('Select files to upload');
      return;
    }
    try {
      await uploadAttachmentsMutation.mutateAsync({ entryId, files });
      messageApi.success('Attachments uploaded');
      setEntryFiles((prev) => ({ ...prev, [entryId]: [] }));
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to upload attachments', messageApi);
    }
  }

  const columns: ColumnsType<OvertimeEntry> = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      width: 110,
      render: (v: string) => formatProjectDate(v),
    },
    {
      title: 'Start',
      dataIndex: 'startTime',
      key: 'startTime',
      width: 80,
    },
    {
      title: 'End',
      dataIndex: 'endTime',
      key: 'endTime',
      width: 80,
    },
    {
      title: 'Holiday',
      dataIndex: 'isHoliday',
      key: 'isHoliday',
      width: 80,
      render: (v: boolean) => (v ? 'Yes' : '—'),
    },
    {
      title: 'Regular',
      dataIndex: 'regularHours',
      key: 'regularHours',
      width: 80,
      align: 'right',
      render: (v: number) => formatOvertimeHours(v),
    },
    {
      title: 'Night',
      dataIndex: 'nightHours',
      key: 'nightHours',
      width: 80,
      align: 'right',
      render: (v: number) => formatOvertimeHours(v),
    },
    {
      title: 'Weekend',
      dataIndex: 'weekendHours',
      key: 'weekendHours',
      width: 90,
      align: 'right',
      render: (v: number) => formatOvertimeHours(v),
    },
    {
      title: 'Holiday hrs',
      dataIndex: 'holidayHours',
      key: 'holidayHours',
      width: 100,
      align: 'right',
      render: (v: number) => formatOvertimeHours(v),
    },
    {
      title: 'Total',
      dataIndex: 'totalHours',
      key: 'totalHours',
      width: 80,
      align: 'right',
      render: (v: number) => formatOvertimeHours(v),
    },
    {
      title: 'Tasks',
      dataIndex: 'taskDescription',
      key: 'taskDescription',
      ellipsis: true,
    },
    ...(canEdit
      ? [
          {
            title: 'Actions',
            key: 'actions',
            width: 140,
            render: (_: unknown, row: OvertimeEntry) => (
              <Space size={4}>
                <Button type="link" size="small" onClick={() => openEditEntry(row)}>
                  Edit
                </Button>
                <Button
                  type="link"
                  size="small"
                  danger
                  icon={<Trash2 size={14} />}
                  onClick={() => setDeleteEntryId(row.id)}
                />
              </Space>
            ),
          } satisfies ColumnsType<OvertimeEntry>[number],
        ]
      : []),
  ];

  if (detailQuery.isLoading) {
    return <Skeleton active paragraph={{ rows: 10 }} />;
  }

  if (detailQuery.isError || !sheet) {
    return (
      <Alert
        type="error"
        showIcon
        title={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : 'Overtime sheet not found'
        }
        action={
          <Button onClick={() => router.push('/hr/overtime')}>
            Back to list
          </Button>
        }
      />
    );
  }

  if (
    !canViewHr &&
    currentUser.data?.id &&
    sheet.employeeId !== currentUser.data.id
  ) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <Skeleton active paragraph={{ rows: 4 }} />
      </div>
    );
  }

  const disabledDate = (current: Dayjs | null): boolean => {
    if (!current) {
      return false;
    }
    return (
      current.month() + 1 !== sheet.month || current.year() !== sheet.year
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => router.push('/hr/overtime')}
        className="flex items-center gap-1.5 text-sm text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] self-start transition-colors"
      >
        <ArrowLeft size={14} />
        <span>Overtime</span>
      </button>

      <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] overflow-hidden">
        <div className="px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                {sheet.sheetNumber}
              </span>
              <StatusBadge
                label={formatOvertimeStatus(sheet.status, t)}
                variant={overtimeStatusVariant(sheet.status)}
              />
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              {canCancel ? (
                <Button danger size="small" onClick={() => setConfirmCancel(true)}>
                  Cancel
                </Button>
              ) : null}
              {canEdit ? (
                <Button
                  type="primary"
                  size="small"
                  disabled={!canSubmit}
                  onClick={() => setConfirmSubmit(true)}
                >
                  Submit for approval
                </Button>
              ) : null}
            </div>
          </div>

          <h1 className="text-lg font-semibold text-[var(--color-text-primary)] leading-snug m-0">
            {formatOvertimePeriod(sheet.month, sheet.year, t)}
          </h1>

          <p className="text-sm text-[var(--color-text-secondary)] mt-2 mb-0">
            <span className="font-medium text-[var(--color-text-primary)]">
              {formatOvertimeEmployeeName(sheet.employee)}
            </span>
          </p>
        </div>
      </div>

      <HoursSummaryCards
        regular={sheet.totalRegularHours}
        night={sheet.totalNightHours}
        weekend={sheet.totalWeekendHours}
        holiday={sheet.totalHolidayHours}
        total={sheet.totalHours}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-start">
        <SectionCard
          title="Entries"
          bodyClassName="px-5 py-4"
          action={
            canEdit ? (
              <Button
                type="primary"
                size="small"
                icon={<Plus size={16} />}
                onClick={openAddEntry}
              >
                Add entry
              </Button>
            ) : undefined
          }
        >
          <Table<OvertimeEntry>
            rowKey="id"
            size="small"
            columns={columns}
            dataSource={sheet.entries ?? []}
            pagination={false}
            scroll={{ x: 1100 }}
            expandable={{
              expandedRowRender: (entry) => (
                <div className="space-y-2 py-1">
                  <Typography.Text strong style={{ fontSize: 13 }}>
                    Attachments
                  </Typography.Text>
                  <AttachmentDownloadList documents={entry.documents} />
                  {canEdit ? (
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="min-w-[220px] flex-1">
                        <FileUploadInput
                          files={entryFiles[entry.id] ?? []}
                          onChange={(files) =>
                            setEntryFiles((prev) => ({
                              ...prev,
                              [entry.id]: files,
                            }))
                          }
                          accept=".pdf,.jpg,.jpeg,.png"
                          multiple
                          disabled={uploadAttachmentsMutation.isPending}
                        />
                      </div>
                      <Button
                        type="primary"
                        size="small"
                        loading={uploadAttachmentsMutation.isPending}
                        disabled={(entryFiles[entry.id] ?? []).length === 0}
                        onClick={() => void handleUploadEntryFiles(entry.id)}
                      >
                        Upload
                      </Button>
                    </div>
                  ) : null}
                </div>
              ),
            }}
            locale={{
              emptyText: (
                <Empty
                  description={
                    canEdit
                      ? 'Add overtime sessions for this month'
                      : 'No entries'
                  }
                />
              ),
            }}
          />
        </SectionCard>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
          {!sheet.approvalRequestId ? (
            <SectionCard title="Approval Chain" bodyClassName="px-5 py-4">
              <p className="text-sm text-[var(--color-text-tertiary)] m-0">
                Approval chain appears after submit.
              </p>
            </SectionCard>
          ) : (
            <ApprovalTierTimeline
              tiers={tiers}
              currentTier={approvalRequest?.currentTier ?? 0}
            />
          )}
        </aside>
      </div>

      <Modal
        title={editingEntry ? 'Edit entry' : 'Add entry'}
        open={entryModalOpen}
        onCancel={() => {
          setEntryModalOpen(false);
          setEditingEntry(null);
        }}
        onOk={() => void handleSaveEntry()}
        confirmLoading={addMutation.isPending || updateMutation.isPending}
        destroyOnHidden
        width={560}
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item
            name="date"
            label="Date"
            rules={[{ required: true, message: 'Date is required' }]}
          >
            <DatePicker
              className="w-full"
              format="DD/MM/YYYY"
              disabledDate={disabledDate}
            />
          </Form.Item>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item
              name="startTime"
              label="Start"
              rules={[{ required: true, message: 'Start time is required' }]}
            >
              <TimePicker className="w-full" format="HH:mm" minuteStep={15} />
            </Form.Item>
            <Form.Item
              name="endTime"
              label="End"
              rules={[{ required: true, message: 'End time is required' }]}
            >
              <TimePicker className="w-full" format="HH:mm" minuteStep={15} />
            </Form.Item>
          </div>
          <Form.Item name="isHoliday" valuePropName="checked">
            <Checkbox>Public holiday</Checkbox>
          </Form.Item>
          {liveHours ? (
            <Alert
              type="info"
              showIcon
              className="mb-4"
              title={
                `Live breakdown — Regular ${formatOvertimeHours(liveHours.regularHours)} · ` +
                `Night ${formatOvertimeHours(liveHours.nightHours)} · ` +
                `Weekend ${formatOvertimeHours(liveHours.weekendHours)} · ` +
                `Holiday ${formatOvertimeHours(liveHours.holidayHours)}`
              }
            />
          ) : null}
          <Form.Item
            name="taskDescription"
            label="Tasks"
            rules={[
              { required: true, message: 'Describe the work performed' },
              { max: 4000 },
            ]}
          >
            <Input.TextArea rows={3} maxLength={4000} showCount />
          </Form.Item>
        </Form>
      </Modal>

      <ConfirmDialog
        open={confirmSubmit}
        title="Submit overtime sheet?"
        description="This will start the approval workflow. You will not be able to edit entries until the sheet is returned."
        confirmLabel="Submit"
        confirmLoading={submitMutation.isPending}
        onConfirm={() => void handleSubmit()}
        onCancel={() => setConfirmSubmit(false)}
      />

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel overtime sheet?"
        description="This cancels the sheet and any linked approval request."
        confirmLabel="Cancel sheet"
        danger
        confirmLoading={cancelMutation.isPending}
        onConfirm={() => void handleCancel()}
        onCancel={() => setConfirmCancel(false)}
      />

      <ConfirmDialog
        open={Boolean(deleteEntryId)}
        title="Delete entry?"
        description="This entry will be removed and sheet totals recalculated."
        confirmLabel="Delete"
        danger
        confirmLoading={deleteMutation.isPending}
        onConfirm={() => void handleDeleteEntry()}
        onCancel={() => setDeleteEntryId(null)}
      />
    </div>
  );
}
