'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Dropdown,
  Empty,
  Grid,
  Skeleton,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { MenuProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DeleteOutlined,
  DownloadOutlined,
  MoreOutlined,
  PlusOutlined,
  SendOutlined,
  StopOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import HrImportModal from '@/components/modules/hr/HrImportModal';
import OvertimeEntryFormDrawer from '@/components/modules/hr/overtime/OvertimeEntryFormDrawer';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DataTable from '@/components/ui/DataTable/DataTable';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import FileUploadInput from '@/components/ui/FileUploadInput/FileUploadInput';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetBreadcrumbLabel } from '@/hooks/use-set-breadcrumb-label';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { ApiRequestError } from '@/lib/api/errors';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import type { OvertimeEntry } from '@/lib/api/overtime.types';
import { useApprovalRequest } from '@/lib/query/approvals';
import {
  downloadOvertimeSheetImportTemplate,
  useCancelOvertimeSheet,
  useDeleteOvertimeEntry,
  useDeleteOvertimeSheet,
  useOvertimeSheet,
  useOvertimeSheetImport,
  useOvertimeSheetImportPreview,
  useSubmitOvertimeSheet,
  useUploadOvertimeEntryAttachments,
} from '@/lib/query/overtime';
import { useOnBehalfEligibleEmployees } from '@/lib/query/on-behalf';
import { useCurrentUser } from '@/lib/query/profile';
import { useAuthStore } from '@/stores/auth.store';
import {
  formatOvertimeEmployeeName,
  formatOvertimeHours,
  formatOvertimePeriod,
  formatOvertimeStatus,
  overtimeStatusVariant,
  unregisteredHolidayDatesFromFormData,
} from '@/lib/utils/overtime-display';
import { exportOvertimeSheetEntriesExcel } from '@/lib/utils/overtime-export-excel';
import { notifyApiError } from '@/lib/utils/notify-api-error';

function DetailSection({
  title,
  children,
  className = '',
  bodyClassName = '',
  action,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  action?: React.ReactNode;
}): React.ReactNode {
  return (
    <div className={`erp-employee-section ${className}`.trim()}>
      <div className="erp-employee-section-header flex flex-wrap items-center justify-between gap-2">
        <h3 className="erp-employee-section-title m-0">{title}</h3>
        {action}
      </div>
      <div className={`erp-employee-section-body ${bodyClassName}`.trim()}>
        {children}
      </div>
    </div>
  );
}

/**
 * Monthly overtime sheet detail — Users / employee profile chrome.
 */
export default function OvertimeSheetDetailPageContent({
  sheetId,
}: {
  sheetId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isNarrow = screens.sm === false;
  const canViewHr = useCanViewHr();
  const currentUser = useCurrentUser();
  const authUser = useAuthStore((state) => state.user);
  const detailQuery = useOvertimeSheet(sheetId);
  const deleteMutation = useDeleteOvertimeEntry(sheetId);
  const uploadAttachmentsMutation = useUploadOvertimeEntryAttachments(sheetId);
  const submitMutation = useSubmitOvertimeSheet(sheetId);
  const cancelMutation = useCancelOvertimeSheet(sheetId);
  const deleteSheetMutation = useDeleteOvertimeSheet();
  const sheetImportPreview = useOvertimeSheetImportPreview(sheetId);
  const sheetImportCommit = useOvertimeSheetImport(sheetId);

  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmDeleteSheet, setConfirmDeleteSheet] = useState(false);
  const [entryDrawerOpen, setEntryDrawerOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<OvertimeEntry | null>(null);
  const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null);
  const [entryFiles, setEntryFiles] = useState<Record<string, File[]>>({});
  const [exporting, setExporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

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

  // Department heads / discipline leads (and HR) may file overtime on an employee's behalf.
  const onBehalfEligibleQuery = useOnBehalfEligibleEmployees(
    currentUser.data?.id,
    currentUser.data?.companyId,
  );
  const isOnBehalfFiler =
    Boolean(sheet) &&
    (onBehalfEligibleQuery.data ?? []).some(
      (employee) => employee.id === sheet?.employeeId,
    );
  const canActForSheet = isOwner || isOnBehalfFiler;

  useSetBreadcrumbLabel(
    sheet
      ? `${formatOvertimeEmployeeName(sheet.employee)} — ${formatOvertimePeriod(sheet.month, sheet.year, t)}`
      : null,
  );

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
      sheet.employeeId !== currentUser.data.id &&
      !onBehalfEligibleQuery.isLoading &&
      !isOnBehalfFiler
    ) {
      router.replace('/approvals');
    }
  }, [
    canViewHr,
    currentUser.data?.id,
    isOnBehalfFiler,
    onBehalfEligibleQuery.isLoading,
    detailQuery.error,
    detailQuery.isError,
    detailQuery.isLoading,
    router,
    sheet,
  ]);

  const canEdit =
    (canActForSheet || canViewHr) &&
    (sheet?.status === 'DRAFT' || sheet?.status === 'RETURNED');
  const canManage = canViewHr;
  const canCancel =
    isOwner &&
    (sheet?.status === 'DRAFT' || sheet?.status === 'SUBMITTED');
  const canSubmit =
    canActForSheet && canEdit && (sheet?.entries?.length ?? 0) > 0;

  function closeEntryDrawer(): void {
    setEntryDrawerOpen(false);
    setEditingEntry(null);
  }

  function openAddEntry(): void {
    setEditingEntry(null);
    setEntryDrawerOpen(true);
  }

  async function handleExportEntries(): Promise<void> {
    if (!sheet) {
      return;
    }
    setExporting(true);
    try {
      await exportOvertimeSheetEntriesExcel({
        companyName: authUser?.companyName ?? 'Company',
        sheetName: t('pages.hr.overtime.exportSheetEntriesSheetName'),
        sheet,
      });
      messageApi.success(t('pages.hr.overtime.exportEntriesSuccess'));
    } catch {
      messageApi.error(t('pages.hr.overtime.exportError'));
    } finally {
      setExporting(false);
    }
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

  async function handleDeleteSheet(): Promise<void> {
    try {
      await deleteSheetMutation.mutateAsync(sheetId);
      messageApi.success(t('hr.messages.overtimeSheetDeleted'));
      setConfirmDeleteSheet(false);
      router.push('/hr/overtime');
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToDeleteOvertimeSheet'),
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
        width: 120,
        render: (date: string) => (
          <div style={{ fontWeight: 500, fontSize: 13 }}>
            {dayjs(date).format('ddd DD MMM')}
          </div>
        ),
      },
      {
        title: t('pages.hr.overtime.timeRange'),
        key: 'time',
        width: 130,
        render: (_: unknown, row: OvertimeEntry) => (
          <span style={{ fontFamily: 'monospace', fontSize: 13 }}>
            {row.startTime} – {row.endTime}
          </span>
        ),
      },
      {
        title: t('pages.hr.overtime.hoursBreakdown'),
        key: 'hoursBreakdown',
        width: 280,
        render: (_: unknown, row: OvertimeEntry) => (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {Number(row.regularHours) > 0 ? (
              <Tag color="blue" style={{ margin: 0 }}>
                {formatOvertimeHours(row.regularHours)}h{' '}
                {t('hr.overtimeCategory.regular')}
              </Tag>
            ) : null}
            {Number(row.nightHours) > 0 ? (
              <Tag color="purple" style={{ margin: 0 }}>
                {formatOvertimeHours(row.nightHours)}h{' '}
                {t('hr.overtimeCategory.night')}
              </Tag>
            ) : null}
            {Number(row.weekendHours) > 0 ? (
              <Tag color="orange" style={{ margin: 0 }}>
                {formatOvertimeHours(row.weekendHours)}h{' '}
                {t('hr.overtimeCategory.weekend')}
              </Tag>
            ) : null}
            {Number(row.holidayHours) > 0 ? (
              <Tooltip title={row.holidayName ?? undefined}>
                <Tag color="red" style={{ margin: 0 }}>
                  {formatOvertimeHours(row.holidayHours)}h{' '}
                  {t('hr.overtimeCategory.holiday')}
                </Tag>
              </Tooltip>
            ) : null}
          </div>
        ),
      },
      {
        title: t('hr.labels.taskDescription'),
        dataIndex: 'taskDescription',
        key: 'taskDescription',
        render: (text: string) => (
          <span
            style={{
              fontSize: 12,
              color: 'var(--color-text-secondary)',
              display: 'block',
              maxWidth: 200,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={text}
          >
            {text || '—'}
          </span>
        ),
      },
      ...(canEdit
        ? [
            {
              title: '',
              key: 'actions',
              width: 56,
              fixed: 'right' as const,
              render: (_: unknown, row: OvertimeEntry) => {
                const items: MenuProps['items'] = [
                  {
                    key: 'edit',
                    label: t('common.update'),
                    onClick: () => openEditEntry(row),
                  },
                  {
                    key: 'delete',
                    label: t('common.delete'),
                    danger: true,
                    onClick: () => setDeleteEntryId(row.id),
                  },
                ];
                return (
                  <div
                    className="erp-table-row-actions flex items-center justify-end"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Dropdown menu={{ items }} trigger={['click']} rootClassName="erp-row-actions-menu">
                      <Button
                        type="text"
                        size="small"
                        icon={<MoreOutlined />}
                        aria-label={t('common.actions')}
                      />
                    </Dropdown>
                  </div>
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
      <div className="erp-pro-list-page erp-users-page erp-employee-detail-page erp-overtime-detail-page">
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !sheet) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-detail-page">
        <Alert
          type="error"
          showIcon
          title={
            detailQuery.error instanceof ApiRequestError
              ? detailQuery.error.message
              : t('hr.messages.overtimeSheetNotFound')
          }
          action={
            <Button onClick={() => router.push('/hr/overtime')}>
              {t('hr.buttons.backToList')}
            </Button>
          }
        />
      </div>
    );
  }

  if (
    !canViewHr &&
    currentUser.data?.id &&
    sheet.employeeId !== currentUser.data.id &&
    !isOnBehalfFiler
  ) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-detail-page">
        <div className="flex min-h-[240px] items-center justify-center">
          <Skeleton active paragraph={{ rows: 4 }} />
        </div>
      </div>
    );
  }

  const employeeName = formatOvertimeEmployeeName(sheet.employee);
  const periodLabel = formatOvertimePeriod(sheet.month, sheet.year, t);
  const unregisteredHolidayDates = unregisteredHolidayDatesFromFormData(
    sheet.approvalRequest?.formData,
  );

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-detail-page erp-overtime-detail-page">
      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-employee-toolbar">
          <div className="erp-employee-toolbar-back flex min-w-0 items-center gap-2">
            <Button
              type="text"
              icon={<ArrowLeft size={16} />}
              onClick={() => router.push('/hr/overtime')}
              aria-label={t('hr.buttons.backToList')}
            >
              {isNarrow ? undefined : t('hr.buttons.back')}
            </Button>
          </div>
          <div className="erp-employee-toolbar-actions flex flex-wrap items-center justify-end gap-2">
            {sheet.approvalRequestId ? (
              <Button
                onClick={() =>
                  router.push(`/approvals/${sheet.approvalRequestId}`)
                }
              >
                {t('hr.buttons.viewInApprovals')}
              </Button>
            ) : null}
            {canCancel ? (
              <Button
                danger
                icon={<StopOutlined />}
                onClick={() => setConfirmCancel(true)}
                aria-label={t('hr.buttons.cancelSheet')}
              >
                {isNarrow ? undefined : t('hr.buttons.cancelSheet')}
              </Button>
            ) : null}
            {(canEdit || canManage) ? (
              <Space.Compact>
                {canEdit ? (
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    disabled={!canSubmit}
                    onClick={() => setConfirmSubmit(true)}
                    aria-label={t('hr.buttons.submitSheet')}
                  >
                    {isNarrow ? undefined : t('hr.buttons.submitSheet')}
                  </Button>
                ) : null}
                {canManage ? (
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => setConfirmDeleteSheet(true)}
                    aria-label={t('common.delete')}
                  >
                    {isNarrow ? undefined : t('common.delete')}
                  </Button>
                ) : null}
              </Space.Compact>
            ) : null}
          </div>
        </div>

        <div className="erp-employee-hero erp-contract-hero">
          <div className="erp-employee-hero-copy min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span className="erp-users-id-chip">{sheet.sheetNumber}</span>
              <StatusBadge
                label={formatOvertimeStatus(sheet.status, t)}
                variant={overtimeStatusVariant(sheet.status)}
              />
            </div>
            <div className="flex min-w-0 flex-wrap items-baseline justify-center gap-2 sm:justify-start">
              <h2 className="erp-users-name erp-employee-hero-name m-0">
                {periodLabel}
              </h2>
            </div>
            <p className="erp-users-email m-0 mt-1.5">{employeeName}</p>
            <p className="erp-users-cell-sub m-0 mt-1">
              {`${t('hr.overtimeCategory.total')} ${formatOvertimeHours(sheet.totalHours)} hrs`}
            </p>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 0,
          border: '1px solid var(--color-border, #e8ebef)',
          borderRadius: 10,
          overflow: 'hidden',
          marginBottom: 20,
        }}
      >
        {(
          [
            {
              label: t('hr.overtimeCategory.regular'),
              value: sheet.totalRegularHours,
              color: '#1677ff',
            },
            {
              label: t('hr.overtimeCategory.night'),
              value: sheet.totalNightHours,
              color: '#722ed1',
            },
            {
              label: t('hr.overtimeCategory.weekend'),
              value: sheet.totalWeekendHours,
              color: '#fa8c16',
            },
            {
              label: t('hr.overtimeCategory.holiday'),
              value: sheet.totalHolidayHours,
              color: '#f5222d',
            },
            {
              label: t('hr.overtimeCategory.total'),
              value: sheet.totalHours,
              color: 'var(--color-teal-600)',
              bold: true,
            },
          ] as const
        ).map((item, i) => (
          <div
            key={item.label}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderLeft:
                i > 0 ? '1px solid var(--color-border, #e8ebef)' : 'none',
              background: 'var(--color-bg-secondary, #fafafa)',
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--color-text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: 4,
              }}
            >
              {item.label}
            </div>
            <div
              style={{
                fontSize: 'bold' in item && item.bold ? 22 : 18,
                fontWeight: 'bold' in item && item.bold ? 700 : 600,
                color:
                  Number(item.value) > 0
                    ? item.color
                    : 'var(--color-text-tertiary)',
              }}
            >
              {Number(item.value) > 0
                ? `${formatOvertimeHours(Number(item.value))}h`
                : '—'}
            </div>
          </div>
        ))}
      </div>

      {unregisteredHolidayDates.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          className="mb-4"
          title={t('hr.overtime.unregisteredHolidayBanner', {
            count: unregisteredHolidayDates.length,
            dates: unregisteredHolidayDates.join(', '),
          })}
        />
      ) : null}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_300px]">
        <div className="erp-pro-card min-w-0">
          <div className="erp-employee-tab-panel erp-contract-detail-body">
            <DetailSection
              title={t('hr.section.entries')}
              bodyClassName="!p-0"
              action={
                <Space.Compact>
                  <Button
                    size="small"
                    icon={<DownloadOutlined />}
                    loading={exporting}
                    onClick={() => void handleExportEntries()}
                  >
                    {t('pages.hr.overtime.exportEntries')}
                  </Button>
                  {canEdit ? (
                    <>
                      <Button
                        size="small"
                        icon={<UploadOutlined />}
                        onClick={() => setImportOpen(true)}
                      >
                        {t('common.importFromExcel')}
                      </Button>
                      <Button
                        type="primary"
                        size="small"
                        icon={<PlusOutlined />}
                        onClick={openAddEntry}
                      >
                        {t('hr.buttons.addEntry')}
                      </Button>
                    </>
                  ) : null}
                </Space.Compact>
              }
            >
              <DataTable<OvertimeEntry>
                rowKey="id"
                className="erp-pro-table erp-users-table"
                size="small"
                columns={columns}
                dataSource={sheet.entries ?? []}
                pagination={false}
                scroll={{ x: 720 }}
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
            </DetailSection>
          </div>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
          {sheet.status === 'DRAFT' ? (
            <div className="erp-pro-card">
              <DetailSection title={t('hr.section.approvalChain')}>
                <div
                  style={{
                    padding: '16px',
                    background: 'var(--color-bg-secondary, #fafafa)',
                    borderRadius: 8,
                    border: '1px solid var(--color-border, #e8ebef)',
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      color: 'var(--color-text-tertiary)',
                    }}
                  >
                    {t('pages.hr.overtime.submitToStartApproval')}
                  </p>
                </div>
              </DetailSection>
            </div>
          ) : approvalRequest ? (
            <ApprovalTierTimeline
              tiers={tiers}
              currentTier={approvalRequest.currentTier ?? 0}
            />
          ) : (
            <div className="erp-pro-card">
              <DetailSection title={t('hr.section.approvalChain')}>
                <p className="erp-users-cell-sub m-0">
                  {t('hr.empty.noApprovalChain')}
                </p>
              </DetailSection>
            </div>
          )}
        </aside>
      </div>

      <OvertimeEntryFormDrawer
        open={entryDrawerOpen}
        sheetId={sheetId}
        sheetMonth={sheet.month}
        sheetYear={sheet.year}
        employeeId={sheet.employeeId}
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
        open={confirmDeleteSheet}
        title={t('hr.empty.deleteOvertimeSheetTitle')}
        description={t('hr.empty.deleteOvertimeSheetDescription')}
        confirmLabel={t('common.delete')}
        danger
        confirmLoading={deleteSheetMutation.isPending}
        onConfirm={() => void handleDeleteSheet()}
        onCancel={() => setConfirmDeleteSheet(false)}
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

      {importOpen ? (
        <HrImportModal
          entity="overtimeEntries"
          onClose={() => setImportOpen(false)}
          onImported={(summary) => {
            messageApi.success(summary);
            void detailQuery.refetch();
          }}
          downloadTemplate={() => downloadOvertimeSheetImportTemplate(sheetId)}
          previewMutation={sheetImportPreview}
          commitMutation={sheetImportCommit}
        />
      ) : null}
    </div>
  );
}
