'use client';

import './overtime-entries-v2.css';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Dropdown,
  Grid,
  Skeleton,
  Space,
  Tooltip,
} from 'antd';
import type { MenuProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  FieldTimeOutlined,
  MoreOutlined,
  PaperClipOutlined,
  PlusOutlined,
  SendOutlined,
  StopOutlined,
  UploadOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { ArrowLeft } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import OvertimeEditDiffBanner from '@/components/modules/approvals/detail/OvertimeEditDiffBanner';
import HrImportModal from '@/components/modules/hr/HrImportModal';
import OvertimeEntryFormDrawer from '@/components/modules/hr/overtime/OvertimeEntryFormDrawer';
import {
  groupOvertimeEntriesByDate,
  type OvertimeDayGroup,
} from '@/components/modules/hr/overtime/overtime-day-groups';
import OvertimeSiteChips from '@/components/modules/hr/overtime/OvertimeSiteChips';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DataTable from '@/components/ui/DataTable/DataTable';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import FileUploadInput from '@/components/ui/FileUploadInput/FileUploadInput';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
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
  overtimeKeys,
  useCancelOvertimeSheet,
  useDeleteOvertimeEntry,
  useDeleteOvertimeSheet,
  useOvertimeSheet,
  useOvertimeSheetImport,
  useOvertimeSheetImportPreview,
  useRemoveOvertimeEntryAttachment,
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
import { resolveOvertimeDetailBackHref } from '@/lib/utils/hr-self-service-nav';

import { DETAIL_PAGE_V2 } from '@/components/ui/list-page-v2';
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
 * Monthly overtime sheet detail - Users / employee profile chrome.
 */
export default function OvertimeSheetDetailPageContent({
  sheetId,
}: {
  sheetId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const returnToParam = searchParams.get('returnTo');
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isNarrow = screens.sm === false;
  const canViewHr = useCanViewHr();
  const currentUser = useCurrentUser();
  const authUser = useAuthStore((state) => state.user);
  const detailQuery = useOvertimeSheet(sheetId);
  const sheet = detailQuery.data;

  const backHref = useMemo(
    () =>
      resolveOvertimeDetailBackHref({
        canViewHr,
        currentUserId: currentUser.data?.id,
        sheetEmployeeId: sheet?.employeeId,
        returnTo: returnToParam,
      }),
    [canViewHr, currentUser.data?.id, returnToParam, sheet?.employeeId],
  );
  const deleteMutation = useDeleteOvertimeEntry(sheetId);
  const uploadAttachmentsMutation = useUploadOvertimeEntryAttachments(sheetId);
  const removeAttachmentMutation = useRemoveOvertimeEntryAttachment(sheetId);
  const submitMutation = useSubmitOvertimeSheet(sheetId);
  const cancelMutation = useCancelOvertimeSheet(sheetId);
  const deleteSheetMutation = useDeleteOvertimeSheet();
  const sheetImportPreview = useOvertimeSheetImportPreview(sheetId);
  const sheetImportCommit = useOvertimeSheetImport(sheetId);

  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmDeleteSheet, setConfirmDeleteSheet] = useState(false);
  const [entryDrawerOpen, setEntryDrawerOpen] = useState(false);
  const [editingEntries, setEditingEntries] = useState<OvertimeEntry[]>([]);
  const [deleteEntryIds, setDeleteEntryIds] = useState<string[]>([]);
  /** Entry whose newly chosen attachments are uploading (choose = upload). */
  const [uploadingEntryId, setUploadingEntryId] = useState<string | null>(null);
  const [pendingRemoveAttachment, setPendingRemoveAttachment] = useState<{
    entryId: string;
    documentId: string;
    name: string;
  } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  useSetHeaderExtra(null);

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
      ? `${formatOvertimeEmployeeName(sheet.employee)} - ${formatOvertimePeriod(sheet.month, sheet.year, t)}`
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

  const payrollLocked = Boolean(sheet?.payrollLocked);
  const canEdit =
    (canActForSheet || canViewHr) &&
    !payrollLocked &&
    (sheet?.canEditEntries === true ||
      sheet?.status === 'DRAFT' ||
      sheet?.status === 'RETURNED' ||
      sheet?.status === 'SUBMITTED' ||
      sheet?.status === 'IN_REVIEW' ||
      sheet?.status === 'APPROVED');
  const isDraftOrReturned =
    sheet?.status === 'DRAFT' || sheet?.status === 'RETURNED';
  const canManage = canViewHr;
  const canCancel =
    isOwner &&
    (sheet?.status === 'DRAFT' || sheet?.status === 'SUBMITTED');
  const canSubmit =
    canActForSheet && isDraftOrReturned && (sheet?.entries?.length ?? 0) > 0;

  function closeEntryDrawer(): void {
    setEntryDrawerOpen(false);
    setEditingEntries([]);
  }

  function openAddEntry(): void {
    setEditingEntries([]);
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

  function openEditDay(group: OvertimeDayGroup): void {
    setEditingEntries(group.entries);
    setEntryDrawerOpen(true);
  }

  async function handleDeleteEntry(): Promise<void> {
    if (deleteEntryIds.length === 0) {
      return;
    }
    try {
      let restarted = false;
      for (const entryId of deleteEntryIds) {
        const result = await deleteMutation.mutateAsync(entryId);
        if (result?.restartedApproval) {
          restarted = true;
        }
      }
      messageApi.success(
        restarted
          ? t('hr.messages.overtimeEntryResubmitted')
          : t('hr.messages.overtimeEntryDeleted'),
      );
      setDeleteEntryIds([]);
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
      await queryClient.invalidateQueries({ queryKey: ['approvals'] });
      await queryClient.invalidateQueries({ queryKey: overtimeKeys.all });
      router.push('/approvals');
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
      router.push(backHref);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToDeleteOvertimeSheet'),
        messageApi,
      );
    }
  }

  /** Uploads as soon as files are chosen; no separate Upload step. */
  async function handleUploadEntryFiles(entryId: string, files: File[]): Promise<void> {
    if (files.length === 0) {
      return;
    }
    setUploadingEntryId(entryId);
    try {
      await uploadAttachmentsMutation.mutateAsync({ entryId, files });
      messageApi.success(t('hr.messages.attachmentsUploaded'));
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToUploadAttachments'),
        messageApi,
      );
    } finally {
      setUploadingEntryId(null);
    }
  }

  async function handleRemoveEntryAttachment(): Promise<void> {
    if (!pendingRemoveAttachment) {
      return;
    }
    try {
      await removeAttachmentMutation.mutateAsync({
        entryId: pendingRemoveAttachment.entryId,
        documentId: pendingRemoveAttachment.documentId,
      });
      messageApi.success(t('hr.messages.attachmentRemoved'));
      setPendingRemoveAttachment(null);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToRemoveAttachment'),
        messageApi,
      );
    }
  }

  const dayGroups = useMemo(
    () => groupOvertimeEntriesByDate(sheet?.entries ?? []),
    [sheet?.entries],
  );

  const columns: ColumnsType<OvertimeDayGroup> = useMemo(
    () => [
      {
        title: t('hr.table.date'),
        dataIndex: 'date',
        key: 'date',
        width: 150,
        render: (date: string, row: OvertimeDayGroup) => {
          const day = dayjs(date);
          const kind =
            row.isHoliday || Number(row.holidayHours) > 0
              ? 'holiday'
              : Number(row.weekendHours) > 0
                ? 'weekend'
                : 'workday';
          return (
            <div className="erp-ot-date" data-kind={kind}>
              <span className="erp-ot-date-day" aria-hidden>
                {day.format('DD')}
              </span>
              <span className="erp-ot-date-meta" aria-hidden>
                <strong>{day.format('ddd')}</strong>
                <span>{day.format('MMM YYYY')}</span>
              </span>
              <span className="sr-only">{day.format('dddd, D MMMM YYYY')}</span>
            </div>
          );
        },
      },
      {
        title: t('pages.hr.overtime.timeRange'),
        key: 'time',
        width: 160,
        render: (_: unknown, row: OvertimeDayGroup) => (
          <div className="flex flex-col gap-1">
            {row.entries.map((entry) => (
              <div key={entry.id}>
                <span className="erp-ot-time">
                  {entry.startTime}
                  <span className="erp-ot-time-arrow" aria-hidden>
                    →
                  </span>
                  <span className="sr-only"> – </span>
                  {entry.endTime}
                </span>
                {entry.isOvernight ? (
                  <div className="erp-ot-pills">
                    <span className="erp-ot-pill" data-kind="night">
                      {t('pages.hr.overtime.overnight')}
                    </span>
                  </div>
                ) : null}
              </div>
            ))}
            <OvertimeSiteChips
              entry={{
                siteAssignmentId: row.siteAssignmentId,
                siteName: row.siteName,
                siteWithinScheduleHours: row.siteWithinScheduleHours,
                siteReviewFlag: row.siteReviewFlag,
              }}
            />
          </div>
        ),
      },
      {
        title: t('pages.hr.overtime.hoursColumn'),
        key: 'hoursBreakdown',
        width: 230,
        render: (_: unknown, row: OvertimeDayGroup) => {
          const parts = (
            [
              ['regular', row.regularHours],
              ['night', row.nightHours],
              ['weekend', row.weekendHours],
              ['holiday', row.holidayHours],
            ] as const
          ).filter(([, hours]) => Number(hours) > 0);
          return (
            <div>
              <span className="erp-ot-hours-total">
                {formatOvertimeHours(row.totalHours)}h
              </span>
              {parts.length > 0 ? (
                <div className="erp-ot-pills">
                  {parts.map(([kind, hours]) => {
                    const pill = (
                      <span key={kind} className="erp-ot-pill" data-kind={kind}>
                        {formatOvertimeHours(hours)}h {t(`hr.overtimeCategory.${kind}`)}
                      </span>
                    );
                    return kind === 'holiday' && row.holidayName ? (
                      <Tooltip key={kind} title={row.holidayName}>
                        {pill}
                      </Tooltip>
                    ) : (
                      pill
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        },
      },
      {
        title: t('hr.labels.taskDescription'),
        key: 'taskDescription',
        render: (_: unknown, row: OvertimeDayGroup) => {
          const fileCount = row.documents.length;
          return (
            <div className="min-w-[200px] flex flex-col gap-1.5">
              {row.entries.map((entry) => (
                <p
                  key={entry.id}
                  className={`erp-ot-task${entry.taskDescription ? '' : ' erp-ot-task--empty'}`}
                  title={entry.taskDescription || undefined}
                >
                  {row.entries.length > 1 ? (
                    <span className="erp-ot-task-time">
                      {entry.startTime}–{entry.endTime}:{' '}
                    </span>
                  ) : null}
                  {entry.taskDescription || '—'}
                </p>
              ))}
              {fileCount > 0 || row.attendanceWarning ? (
                <div className="erp-ot-task-chips">
                  {fileCount > 0 ? (
                    <span className="erp-ot-pill">
                      <PaperClipOutlined aria-hidden />
                      {fileCount === 1
                        ? t('pages.hr.overtime.attachmentsCountOne')
                        : t('pages.hr.overtime.attachmentsCount', { count: fileCount })}
                    </span>
                  ) : null}
                  {row.attendanceWarning ? (
                    <Tooltip title={row.attendanceWarning}>
                      <span className="erp-ot-pill" data-kind="warning" tabIndex={0}>
                        <WarningOutlined aria-hidden />
                        {t('pages.hr.overtime.attendanceFlag')}
                      </span>
                    </Tooltip>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        },
      },
      ...(canEdit
        ? [
            {
              title: '',
              key: 'actions',
              width: 56,
              fixed: 'right' as const,
              render: (_: unknown, row: OvertimeDayGroup) => {
                const items: MenuProps['items'] = [
                  {
                    key: 'edit',
                    icon: <EditOutlined />,
                    label: t('common.update'),
                    onClick: () => openEditDay(row),
                  },
                  {
                    key: 'delete',
                    icon: <DeleteOutlined />,
                    label: t('common.delete'),
                    danger: true,
                    onClick: () =>
                      setDeleteEntryIds(row.entries.map((entry) => entry.id)),
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
            } satisfies ColumnsType<OvertimeDayGroup>[number],
          ]
        : []),
    ],
    [canEdit, t],
  );

  if (detailQuery.isLoading) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-employee-detail-page erp-overtime-detail-page ${DETAIL_PAGE_V2}`}>
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !sheet) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-employee-detail-page ${DETAIL_PAGE_V2}`}>
        <Alert
          type="error"
          showIcon
          title={
            detailQuery.error instanceof ApiRequestError
              ? detailQuery.error.message
              : t('hr.messages.overtimeSheetNotFound')
          }
          action={
            <Button onClick={() => router.push(backHref)}>
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
      <div className={`erp-pro-list-page erp-users-page erp-employee-detail-page ${DETAIL_PAGE_V2}`}>
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
    <div className={`erp-pro-list-page erp-users-page erp-employee-detail-page erp-overtime-detail-page ${DETAIL_PAGE_V2}`}>
      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-employee-toolbar">
          <div className="erp-employee-toolbar-back flex min-w-0 items-center gap-2">
            <Button
              type="text"
              icon={<ArrowLeft size={16} />}
              onClick={() => router.push(backHref)}
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
            {(isDraftOrReturned || canManage) ? (
              <Space.Compact>
                {isDraftOrReturned && canActForSheet ? (
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
              {sheet.editedAfterApproval ? (
                <span className="rounded-lg bg-[#FEF0E6] px-2 py-0.5 text-[12px] font-medium text-[#D4610A]">
                  {t('pages.hr.overtime.resubmittedBadge')}
                </span>
              ) : null}
            </div>
            <div className="flex min-w-0 flex-wrap items-baseline justify-center gap-2 sm:justify-start">
              <h2 className="erp-users-name erp-employee-hero-name m-0">
                {employeeName}
              </h2>
            </div>
            <p className="erp-users-email m-0 mt-1.5">{periodLabel}</p>
            <p className="erp-users-cell-sub m-0 mt-1">
              {`${t('hr.overtimeCategory.total')} ${formatOvertimeHours(sheet.totalHours)} hrs`}
            </p>
          </div>
        </div>
      </div>

      {payrollLocked ? (
        <Alert
          type="warning"
          showIcon
          className="!rounded-xl"
          title={t('pages.hr.overtime.payrollLockedBanner')}
        />
      ) : null}

      {sheet.editDiff?.editedAfterApproval ? (
        <OvertimeEditDiffBanner editDiff={sheet.editDiff} />
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4">
        {(
          [
            {
              label: t('hr.overtimeCategory.regular'),
              value: sheet.totalRegularHours,
              color: 'text-blue-700',
            },
            {
              label: t('hr.overtimeCategory.night'),
              value: sheet.totalNightHours,
              color: 'text-violet-700',
            },
            {
              label: t('hr.overtimeCategory.weekend'),
              value: sheet.totalWeekendHours,
              color: 'text-amber-700',
            },
            {
              label: t('hr.overtimeCategory.holiday'),
              value: sheet.totalHolidayHours,
              color: 'text-red-700',
            },
            {
              label: t('hr.overtimeCategory.total'),
              value: sheet.totalHours,
              color: 'text-[#0f6e56]',
              total: true,
            },
          ] as const
        ).map((item) => {
          const hours = Number(item.value);
          const isTotal = 'total' in item && item.total;
          return (
            <div
              key={item.label}
              className={`rounded-2xl px-5 py-4 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_4px_16px_rgba(16,24,40,0.06)] ${
                isTotal ? 'bg-[#f0faf6]' : 'bg-white'
              }`}
            >
              <p className="m-0 text-xs font-semibold tracking-[0.06em] text-gray-600 uppercase">
                {item.label}
              </p>
              <p
                className={`m-0 mt-1 font-semibold tabular-nums ${isTotal ? 'text-2xl' : 'text-xl'} ${
                  hours > 0 ? item.color : 'text-gray-400'
                }`}
              >
                {hours > 0 ? `${formatOvertimeHours(hours)}h` : '-'}
              </p>
            </div>
          );
        })}
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
        <section
          className="erp-pro-card erp-ot-entries min-w-0"
          aria-labelledby="ot-entries-title"
        >
          <div className="erp-ot-entries-header">
            <h3 id="ot-entries-title" className="erp-ot-entries-title">
              {t('hr.section.entries')}
              <span className="erp-ot-entries-count">
                {dayGroups.length.toLocaleString()}
              </span>
            </h3>
            <div className="erp-ot-entries-actions">
              <Button
                icon={<DownloadOutlined />}
                loading={exporting}
                disabled={(sheet.entries?.length ?? 0) === 0}
                onClick={() => void handleExportEntries()}
                aria-label={t('pages.hr.overtime.exportEntries')}
              >
                {isNarrow ? undefined : t('pages.hr.overtime.exportEntries')}
              </Button>
              {canEdit ? (
                <>
                  <Button
                    icon={<UploadOutlined />}
                    onClick={() => setImportOpen(true)}
                    aria-label={t('common.importFromExcel')}
                  >
                    {isNarrow ? undefined : t('common.importFromExcel')}
                  </Button>
                  <Button type="primary" icon={<PlusOutlined />} onClick={openAddEntry}>
                    {t('hr.buttons.addEntry')}
                  </Button>
                </>
              ) : null}
            </div>
          </div>
          <DataTable<OvertimeDayGroup>
            rowKey="key"
            className="erp-pro-table erp-users-table"
            size="middle"
            columns={columns}
            dataSource={dayGroups}
            pagination={false}
            scroll={{ x: 760 }}
            expandable={{
              expandedRowRender: (group) => (
                <div className="erp-ot-expanded flex flex-col gap-4">
                  {group.entries.map((entry) => (
                    <div key={entry.id}>
                      <p className="erp-ot-expanded-title">
                        {t('hr.section.attachments')}
                        {group.entries.length > 1
                          ? ` · ${entry.startTime}–${entry.endTime}`
                          : ''}
                      </p>
                      <AttachmentDownloadList
                        documents={entry.documents}
                        onRemove={
                          canEdit
                            ? (documentId) => {
                                const doc = entry.documents?.find(
                                  (item) => item.id === documentId,
                                );
                                setPendingRemoveAttachment({
                                  entryId: entry.id,
                                  documentId,
                                  name: doc?.name ?? documentId,
                                });
                              }
                            : undefined
                        }
                        removingId={
                          removeAttachmentMutation.isPending
                            ? pendingRemoveAttachment?.documentId
                            : null
                        }
                        removeLabel={t('hr.buttons.removeItem')}
                      />
                      {canEdit ? (
                        <div aria-live="polite">
                          <FileUploadInput
                            files={[]}
                            onChange={(files) =>
                              void handleUploadEntryFiles(entry.id, files)
                            }
                            accept=".pdf,.jpg,.jpeg,.png"
                            multiple
                            disabled={uploadingEntryId !== null}
                            placeholder={
                              uploadingEntryId === entry.id
                                ? t('pages.hr.overtime.uploadingFiles')
                                : t('pages.hr.overtime.attachFiles')
                            }
                          />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ),
            }}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<FieldTimeOutlined />}
                  title={t('pages.hr.overtime.entriesEmptyTitle')}
                  description={t('hr.empty.noEntries')}
                  action={
                    canEdit
                      ? { label: t('hr.buttons.addEntry'), onClick: openAddEntry }
                      : undefined
                  }
                />
              ),
            }}
          />
        </section>

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
        editingEntries={editingEntries}
        sheetEntries={sheet.entries}
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
        open={deleteEntryIds.length > 0}
        title={t('hr.dialog.deleteOvertimeEntryTitle')}
        description={
          deleteEntryIds.length > 1
            ? t('hr.dialog.deleteOvertimeDayDesc', {
                count: deleteEntryIds.length,
              })
            : t('hr.dialog.deleteOvertimeEntryDesc')
        }
        confirmLabel={t('common.delete')}
        danger
        confirmLoading={deleteMutation.isPending}
        onConfirm={() => void handleDeleteEntry()}
        onCancel={() => setDeleteEntryIds([])}
      />

      <ConfirmDialog
        open={Boolean(pendingRemoveAttachment)}
        title={t('pages.hr.overtime.removeAttachmentTitle')}
        description={t('pages.hr.overtime.removeAttachmentDescription', {
          name: pendingRemoveAttachment?.name ?? '',
        })}
        confirmLabel={t('hr.buttons.removeItem')}
        danger
        confirmLoading={removeAttachmentMutation.isPending}
        onConfirm={() => void handleRemoveEntryAttachment()}
        onCancel={() => {
          if (!removeAttachmentMutation.isPending) {
            setPendingRemoveAttachment(null);
          }
        }}
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
