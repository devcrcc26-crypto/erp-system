'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Dropdown,
  Empty,
  Spin,
  Typography,
} from 'antd';
import type { MenuProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ArrowLeft, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import OvertimeEntryFormDrawer from '@/components/modules/hr/overtime/OvertimeEntryFormDrawer';
import {
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DataTable from '@/components/ui/DataTable/DataTable';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import FileUploadInput from '@/components/ui/FileUploadInput/FileUploadInput';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { ApiRequestError } from '@/lib/api/errors';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import type { OvertimeEntry } from '@/lib/api/overtime.types';
import { useApprovalRequest } from '@/lib/query/approvals';
import {
  useCancelOvertimeSheet,
  useDeleteOvertimeEntry,
  useOvertimeSheet,
  useSubmitOvertimeSheet,
  useUploadOvertimeEntryAttachments,
} from '@/lib/query/overtime';
import { useCurrentUser } from '@/lib/query/profile';
import {
  formatOvertimeEmployeeName,
  formatOvertimeHours,
  formatOvertimePeriod,
  formatOvertimeStatus,
  overtimeStatusVariant,
} from '@/lib/utils/overtime-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';

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
  const deleteMutation = useDeleteOvertimeEntry(sheetId);
  const uploadAttachmentsMutation = useUploadOvertimeEntryAttachments(sheetId);
  const submitMutation = useSubmitOvertimeSheet(sheetId);
  const cancelMutation = useCancelOvertimeSheet(sheetId);

  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [entryDrawerOpen, setEntryDrawerOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<OvertimeEntry | null>(null);
  const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null);
  const [entryFiles, setEntryFiles] = useState<Record<string, File[]>>({});

  useSetHeaderExtra(null);

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

  function closeEntryDrawer(): void {
    setEntryDrawerOpen(false);
    setEditingEntry(null);
  }

  function openAddEntry(): void {
    setEditingEntry(null);
    setEntryDrawerOpen(true);
  }

  function openEditEntry(entry: OvertimeEntry): void {
    setEditingEntry(entry);
    setEntryDrawerOpen(true);
  }

  async function handleDeleteEntry(): Promise<void> {
    if (!deleteEntryId) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(deleteEntryId);
      messageApi.success(t('hr.messages.overtimeEntryDeleted'));
      setDeleteEntryId(null);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToDeleteOvertimeEntry'),
        messageApi,
      );
    }
  }

  async function handleSubmit(): Promise<void> {
    try {
      await submitMutation.mutateAsync();
      messageApi.success(t('hr.messages.overtimeSheetSubmitted'));
      setConfirmSubmit(false);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToSubmitOvertimeSheet'),
        messageApi,
      );
    }
  }

  async function handleCancel(): Promise<void> {
    try {
      await cancelMutation.mutateAsync();
      messageApi.success(t('hr.messages.overtimeSheetCancelled'));
      setConfirmCancel(false);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToCancelOvertimeSheet'),
        messageApi,
      );
    }
  }

  async function handleUploadEntryFiles(entryId: string): Promise<void> {
    const files = entryFiles[entryId] ?? [];
    if (files.length === 0) {
      messageApi.warning(t('hr.messages.selectFilesToUpload'));
      return;
    }
    try {
      await uploadAttachmentsMutation.mutateAsync({ entryId, files });
      messageApi.success(t('hr.messages.attachmentsUploaded'));
      setEntryFiles((prev) => ({ ...prev, [entryId]: [] }));
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToUploadAttachments'),
        messageApi,
      );
    }
  }

  const columns: ColumnsType<OvertimeEntry> = useMemo(
    () => [
      {
        title: t('hr.table.date'),
        dataIndex: 'date',
        key: 'date',
        width: 110,
        render: (v: string) => formatProjectDate(v),
      },
      {
        title: t('hr.form.startTime'),
        dataIndex: 'startTime',
        key: 'startTime',
        width: 80,
      },
      {
        title: t('hr.form.endTime'),
        dataIndex: 'endTime',
        key: 'endTime',
        width: 80,
      },
      {
        title: t('hr.overtimeCategory.holiday'),
        dataIndex: 'isHoliday',
        key: 'isHoliday',
        width: 80,
        render: (v: boolean) => (v ? t('hr.labels.yes') : '—'),
      },
      {
        title: t('hr.overtimeCategory.regular'),
        dataIndex: 'regularHours',
        key: 'regularHours',
        width: 80,
        align: 'right' as const,
        render: (v: number) => formatOvertimeHours(v),
      },
      {
        title: t('hr.overtimeCategory.night'),
        dataIndex: 'nightHours',
        key: 'nightHours',
        width: 80,
        align: 'right' as const,
        render: (v: number) => formatOvertimeHours(v),
      },
      {
        title: t('hr.overtimeCategory.weekend'),
        dataIndex: 'weekendHours',
        key: 'weekendHours',
        width: 90,
        align: 'right' as const,
        render: (v: number) => formatOvertimeHours(v),
      },
      {
        title: t('hr.table.holidayHours'),
        dataIndex: 'holidayHours',
        key: 'holidayHours',
        width: 100,
        align: 'right' as const,
        render: (v: number) => formatOvertimeHours(v),
      },
      {
        title: t('hr.overtimeCategory.total'),
        dataIndex: 'totalHours',
        key: 'totalHours',
        width: 80,
        align: 'right' as const,
        render: (v: number) => formatOvertimeHours(v),
      },
      {
        title: t('hr.labels.taskDescription'),
        dataIndex: 'taskDescription',
        key: 'taskDescription',
        ellipsis: true,
      },
      ...(canEdit
        ? [
            {
              title: t('hr.table.actions'),
              key: 'actions',
              width: 140,
              fixed: 'right' as const,
              render: (_: unknown, row: OvertimeEntry) => {
                const items: MenuProps['items'] = [
                  {
                    key: 'edit',
                    label: t('common.update'),
                    icon: <Pencil size={14} />,
                    onClick: () => openEditEntry(row),
                  },
                  {
                    key: 'delete',
                    label: t('common.delete'),
                    icon: <Trash2 size={14} />,
                    danger: true,
                    onClick: () => setDeleteEntryId(row.id),
                  },
                ];
                return (
                  <Dropdown menu={{ items }} trigger={['click']}>
                    <Button
                      type="text"
                      size="small"
                      icon={<MoreHorizontal size={16} />}
                      onClick={(event) => event.stopPropagation()}
                      style={{ borderRadius: 0 }}
                    />
                  </Dropdown>
                );
              },
            } satisfies ColumnsType<OvertimeEntry>[number],
          ]
        : []),
    ],
    [canEdit, t],
  );

  if (detailQuery.isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Spin />
      </div>
    );
  }

  if (detailQuery.isError || !sheet) {
    return (
      <Alert
        type="error"
        showIcon
        title={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : t('hr.messages.overtimeSheetNotFound')
        }
        action={
          <Button
            onClick={() => router.push('/hr/overtime')}
            style={{ borderRadius: 0 }}
          >
            {t('hr.buttons.backToList')}
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
        <Spin />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="text"
          icon={<ArrowLeft size={16} />}
          onClick={() => router.push('/hr/overtime')}
          style={{ borderRadius: 0 }}
        >
          {t('hr.buttons.backToList')}
        </Button>
      </div>

      <div className="overflow-hidden rounded-none border border-[rgba(0,0,0,0.08)] bg-white">
        <div className="px-3 py-4 sm:px-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                {sheet.sheetNumber}
              </span>
              <StatusBadge
                label={formatOvertimeStatus(sheet.status, t)}
                variant={overtimeStatusVariant(sheet.status)}
              />
            </div>
            <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
              {canCancel ? (
                <Button
                  danger
                  size="small"
                  onClick={() => setConfirmCancel(true)}
                  style={{ borderRadius: 0 }}
                >
                  {t('hr.buttons.cancelSheet')}
                </Button>
              ) : null}
              {canEdit ? (
                <Button
                  type="primary"
                  size="small"
                  disabled={!canSubmit}
                  onClick={() => setConfirmSubmit(true)}
                  style={{ borderRadius: 0 }}
                >
                  {t('hr.buttons.submitSheet')}
                </Button>
              ) : null}
            </div>
          </div>

          <h1 className="m-0 text-lg font-semibold leading-snug text-[var(--color-text-primary)]">
            {formatOvertimePeriod(sheet.month, sheet.year, t)}
          </h1>

          <p className="mb-0 mt-2 text-sm text-[var(--color-text-secondary)]">
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

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_300px]">
        <SectionCard
          title={t('hr.section.entries')}
          bodyClassName="p-0"
          action={
            canEdit ? (
              <Button
                type="primary"
                size="small"
                icon={<Plus size={16} />}
                onClick={openAddEntry}
                style={{ borderRadius: 0 }}
              >
                {t('hr.buttons.addEntry')}
              </Button>
            ) : undefined
          }
        >
          <DataTable<OvertimeEntry>
            rowKey="id"
            className="erp-pro-table"
            size="small"
            columns={columns}
            dataSource={sheet.entries ?? []}
            pagination={false}
            scroll={{ x: 1100 }}
            expandable={{
              expandedRowRender: (entry) => (
                <div className="space-y-2 py-1">
                  <Typography.Text strong style={{ fontSize: 13 }}>
                    {t('hr.section.attachments')}
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
                        style={{ borderRadius: 0 }}
                      >
                        {t('hr.buttons.uploadAttachments')}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ),
            }}
            locale={{
              emptyText: <Empty description={t('hr.empty.noEntries')} />,
            }}
          />
        </SectionCard>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
          {!sheet.approvalRequestId ? (
            <SectionCard
              title={t('hr.section.approvalChain')}
              bodyClassName="px-3 py-4 sm:px-5"
            >
              <p className="m-0 text-sm text-[var(--color-text-tertiary)]">
                {t('hr.empty.noApprovalChain')}
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

      <OvertimeEntryFormDrawer
        open={entryDrawerOpen}
        sheetId={sheetId}
        sheetMonth={sheet.month}
        sheetYear={sheet.year}
        editingEntry={editingEntry}
        onClose={closeEntryDrawer}
      />

      <ConfirmDialog
        open={confirmSubmit}
        title={t('hr.dialog.submitOvertimeSheetTitle')}
        description={t('hr.dialog.submitOvertimeSheetDesc')}
        confirmLabel={t('hr.buttons.submitSheet')}
        confirmLoading={submitMutation.isPending}
        onConfirm={() => void handleSubmit()}
        onCancel={() => setConfirmSubmit(false)}
      />

      <ConfirmDialog
        open={confirmCancel}
        title={t('hr.dialog.cancelOvertimeSheetTitle')}
        description={t('hr.dialog.cancelOvertimeSheetDesc')}
        confirmLabel={t('hr.buttons.cancelSheet')}
        danger
        confirmLoading={cancelMutation.isPending}
        onConfirm={() => void handleCancel()}
        onCancel={() => setConfirmCancel(false)}
      />

      <ConfirmDialog
        open={Boolean(deleteEntryId)}
        title={t('hr.dialog.deleteOvertimeEntryTitle')}
        description={t('hr.dialog.deleteOvertimeEntryDesc')}
        confirmLabel={t('common.delete')}
        danger
        confirmLoading={deleteMutation.isPending}
        onConfirm={() => void handleDeleteEntry()}
        onCancel={() => setDeleteEntryId(null)}
      />
    </div>
  );
}
