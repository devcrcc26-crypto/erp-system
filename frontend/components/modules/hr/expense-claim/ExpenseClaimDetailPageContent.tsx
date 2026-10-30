'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';
import '@/components/modules/profile/profile-v2.css';
import '@/components/modules/users/employee-detail-v2.css';
import '@/components/modules/hr/overtime/overtime-entries-v2.css';

import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import {
  Alert,
  Button,
  DatePicker,
  Dropdown,
  Form,
  Grid,
  Input,
  Modal,
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
  MoreOutlined,
  PlusOutlined,
  SendOutlined,
  StopOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { ArrowLeft, Download, Eye, File, Receipt } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  DocumentPreviewActions,
  DocumentPreviewGroup,
} from '@/components/shared/preview';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import ExpenseClaimItemModal from '@/components/modules/hr/expense-claim/ExpenseClaimItemModal';
import HrImportModal from '@/components/modules/hr/HrImportModal';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import ProfileFileTypeIcon from '@/components/modules/users/ProfileFileTypeIcon';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr, useCanViewTeam } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import { ApiRequestError } from '@/lib/api/errors';
import type { ExpenseClaimItem } from '@/lib/api/expense-claim.types';
import { useApprovalRequest } from '@/lib/query/approvals';
import {
  downloadExpenseClaimItemsImportTemplate,
  useCancelExpenseClaim,
  useDeleteExpenseClaim,
  useDeleteExpenseClaimItem,
  useExpenseClaim,
  useExpenseClaimItemsImport,
  useExpenseClaimItemsImportPreview,
  useMarkExpenseClaimPaid,
  useSubmitExpenseClaim,
} from '@/lib/query/expense-claim';
import { useCurrentUser } from '@/lib/query/profile';
import { useAuthStore } from '@/stores/auth.store';
import {
  expenseClaimStatusVariant,
  formatEtbAmount,
  formatExpenseClaimEmployeeName,
  formatExpenseClaimStatus,
  itemReceiptDocuments,
} from '@/lib/utils/expense-claim-display';
import { exportExpenseClaimDetailItemsExcel } from '@/lib/utils/expense-claim-export-excel';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';

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
 * Expense claim detail - Users / employee profile chrome (aligned with leave & overtime).
 */
export default function ExpenseClaimDetailPageContent({
  claimId,
}: {
  claimId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;
  const canViewHr = useCanViewHr();
  const canViewTeam = useCanViewTeam();
  const currentUser = useCurrentUser();
  const authUser = useAuthStore((state) => state.user);
  const detailQuery = useExpenseClaim(claimId);
  const submitMutation = useSubmitExpenseClaim(claimId);
  const cancelMutation = useCancelExpenseClaim(claimId);
  const markPaidMutation = useMarkExpenseClaimPaid(claimId);
  const deleteClaimMutation = useDeleteExpenseClaim();
  const deleteItemMutation = useDeleteExpenseClaimItem(claimId);
  const itemsImportPreview = useExpenseClaimItemsImportPreview(claimId);
  const itemsImportCommit = useExpenseClaimItemsImport(claimId);

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ExpenseClaimItem | null>(null);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDeleteClaim, setConfirmDeleteClaim] = useState(false);
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [markPaidForm] = Form.useForm<{
    paidDate: dayjs.Dayjs;
    paymentReference?: string;
  }>();

  useSetHeaderExtra(null);

  const claim = detailQuery.data;
  const approvalRequestId = claim?.approvalRequestId ?? null;
  const approvalQuery = useApprovalRequest(
    approvalRequestId ?? '',
    Boolean(approvalRequestId) &&
      !(
        claim?.approvalRequest?.tiers &&
        claim.approvalRequest.tiers.length > 0
      ),
  );

  const approvalRequest =
    claim?.approvalRequest?.tiers && claim.approvalRequest.tiers.length > 0
      ? claim.approvalRequest
      : (approvalQuery.data ?? claim?.approvalRequest ?? null);

  const tiers = useMemo(
    () => (approvalRequest?.tiers ?? []) as ApprovalTier[],
    [approvalRequest?.tiers],
  );

  const isOwner = Boolean(claim) && claim?.employeeId === currentUser.data?.id;
  const isDraft = claim?.status === 'DRAFT';
  const canManage = canViewHr;
  const canEditHeader =
    Boolean(claim) &&
    (claim?.status === 'DRAFT' || claim?.status === 'RETURNED') &&
    (canManage || isOwner);
  // Returned claims can fix items too, then resubmit from Approvals.
  const canEditItems = Boolean(
    (isOwner || canViewHr) &&
      (claim?.status === 'DRAFT' || claim?.status === 'RETURNED'),
  );
  const canCancel =
    Boolean(isOwner) &&
    (claim?.status === 'DRAFT' || claim?.status === 'SUBMITTED');
  const missingReceiptCount = useMemo(
    () => (claim?.items ?? []).filter((item) => item.receipts.length === 0).length,
    [claim?.items],
  );
  const canSubmit =
    Boolean(isOwner && isDraft) &&
    (claim?.items.length ?? 0) > 0 &&
    missingReceiptCount === 0;
  const canMarkPaid =
    canManage &&
    claim?.status === 'APPROVED' &&
    !claim?.paidAt;

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
      claim &&
      currentUser.data?.id &&
      claim.employeeId !== currentUser.data.id
    ) {
      router.replace('/approvals');
    }
  }, [
    canViewHr,
    claim,
    currentUser.data?.id,
    detailQuery.error,
    detailQuery.isError,
    detailQuery.isLoading,
    router,
  ]);

  function openAddItem(): void {
    setEditingItem(null);
    setItemModalOpen(true);
  }

  async function handleExportItems(): Promise<void> {
    if (!claim) {
      return;
    }
    setExporting(true);
    try {
      await exportExpenseClaimDetailItemsExcel({
        companyName: authUser?.companyName ?? 'Company',
        sheetName: t('pages.hr.expenseClaim.exportClaimItemsSheetName'),
        claim,
      });
      messageApi.success(t('pages.hr.expenseClaim.exportItemsSuccess'));
    } catch {
      messageApi.error(t('pages.hr.expenseClaim.exportError'));
    } finally {
      setExporting(false);
    }
  }

  function openEditItem(item: ExpenseClaimItem): void {
    setEditingItem(item);
    setItemModalOpen(true);
  }

  async function handleDeleteItem(): Promise<void> {
    if (!deleteItemId) {
      return;
    }
    try {
      await deleteItemMutation.mutateAsync(deleteItemId);
      messageApi.success(t('hr.messages.expenseClaimItemDeleted'));
      setDeleteItemId(null);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToDeleteExpenseClaimItem'),
        messageApi,
      );
    }
  }

  async function handleSubmit(): Promise<void> {
    try {
      await submitMutation.mutateAsync();
      messageApi.success(t('hr.messages.expenseClaimSubmitted'));
      setConfirmSubmit(false);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToSubmitExpenseClaim'),
        messageApi,
      );
    }
  }

  async function handleCancel(): Promise<void> {
    try {
      await cancelMutation.mutateAsync();
      messageApi.success(t('hr.messages.expenseClaimCancelled'));
      setConfirmCancel(false);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToCancelExpenseClaim'),
        messageApi,
      );
    }
  }

  async function handleMarkPaid(): Promise<void> {
    try {
      const values = await markPaidForm.validateFields();
      await markPaidMutation.mutateAsync({
        paidDate: values.paidDate.format('YYYY-MM-DD'),
        paymentReference: values.paymentReference?.trim() || undefined,
      });
      messageApi.success(t('pages.hr.expenseClaim.markPaidSuccess'));
      setMarkPaidOpen(false);
      markPaidForm.resetFields();
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'errorFields' in error) {
        return;
      }
      notifyApiError(
        error,
        t('pages.hr.expenseClaim.markPaidFailed'),
        messageApi,
      );
    }
  }

  async function handleDeleteClaim(): Promise<void> {
    try {
      await deleteClaimMutation.mutateAsync(claimId);
      messageApi.success(t('hr.messages.expenseClaimDeleted'));
      setConfirmDeleteClaim(false);
      router.push('/hr/expense-claims');
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToDeleteExpenseClaim'),
        messageApi,
      );
    }
  }

  const columns: ColumnsType<ExpenseClaimItem> = useMemo(
    () => [
      {
        title: t('hr.table.date'),
        dataIndex: 'expenseDate',
        key: 'expenseDate',
        width: 100,
        responsive: ['sm'],
        render: (v: string) => (
          <span className="erp-users-cell-strong">{formatProjectDate(v)}</span>
        ),
      },
      {
        title: t('hr.table.category'),
        dataIndex: 'category',
        key: 'category',
        width: 140,
        responsive: ['md'],
        render: (value: string) => (
          <span className="erp-users-role-tag">{value}</span>
        ),
      },
      {
        title: t('hr.table.description'),
        dataIndex: 'description',
        key: 'description',
        width: 260,
        ellipsis: true,
        render: (value: string, row: ExpenseClaimItem) => (
          <div className="min-w-0 max-w-[260px]">
            <Tooltip title={value}>
              <span className="erp-users-cell-strong block truncate">{value}</span>
            </Tooltip>
            <p className="erp-users-cell-sub m-0 mt-0.5 sm:hidden">
              {formatProjectDate(row.expenseDate)}
            </p>
            <p className="erp-users-cell-sub m-0 mt-0.5 md:hidden">
              {row.category}
            </p>
            <p className="erp-users-cell-sub m-0 mt-0.5 tabular-nums lg:hidden">
              {formatEtbAmount(row.amount)}
            </p>
          </div>
        ),
      },
      {
        title: t('hr.table.amount'),
        key: 'amount',
        width: isNarrow ? 96 : isCompact ? 112 : 140,
        align: 'right',
        render: (_: unknown, row: ExpenseClaimItem) => (
          <span className="erp-users-cell-strong tabular-nums">
            {formatEtbAmount(row.amount)}
          </span>
        ),
      },
      {
        title: t('hr.table.receipt'),
        key: 'receipt',
        width: isNarrow ? 72 : 96,
        render: (_: unknown, row: ExpenseClaimItem) => {
          // One row per item; each of its receipts gets its own preview/download.
          const receipts = itemReceiptDocuments(row);
          return receipts.length > 0 ? (
            <div
              className="flex flex-col gap-0.5"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              {receipts.map((receipt) => (
              <div key={receipt.id} className="flex items-center gap-0.5 sm:gap-1">
              <DocumentPreviewActions document={receipt}>
                {(actions) => (
                  <>
                    <Tooltip title={receipt.name}>
                      <span className="inline-flex shrink-0">
                        <ProfileFileTypeIcon
                          name={receipt.name}
                          fileType={receipt.fileType}
                          size="sm"
                        />
                      </span>
                    </Tooltip>
                    {actions.canPreview ? (
                      <Tooltip
                        title={isNarrow ? undefined : t('common.preview')}
                      >
                        <Button
                          type="text"
                          size="small"
                          className="erp-expense-receipt-download-btn"
                          icon={
                            <Eye size={isNarrow ? 14 : 15} strokeWidth={1.75} />
                          }
                          loading={actions.previewLoading}
                          aria-label={t('common.previewFile', {
                            name: receipt.name,
                          })}
                          onClick={actions.preview}
                        />
                      </Tooltip>
                    ) : null}
                    <Tooltip
                      title={isNarrow ? undefined : t('common.download')}
                    >
                      <Button
                        type="text"
                        size="small"
                        className="erp-expense-receipt-download-btn"
                        icon={
                          <Download
                            size={isNarrow ? 14 : 15}
                            strokeWidth={1.75}
                          />
                        }
                        loading={actions.downloading}
                        aria-label={t('common.download')}
                        onClick={actions.download}
                      />
                    </Tooltip>
                  </>
                )}
              </DocumentPreviewActions>
              </div>
              ))}
            </div>
          ) : (
            <Tooltip title={t('hr.labels.receiptMissing')}>
              <span
                className="erp-expense-receipt-missing inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#fecaca] bg-[#fef2f2] text-[#DC2626] opacity-70"
                aria-label={t('hr.labels.receiptMissing')}
              >
                <File size={16} strokeWidth={1.75} />
              </span>
            </Tooltip>
          );
        },
      },
      ...(canEditItems
        ? [
            {
              title: '',
              key: 'actions',
              width: 44,
              fixed: isCompact ? undefined : ('right' as const),
              render: (_: unknown, row: ExpenseClaimItem) => {
                const items: MenuProps['items'] = [
                  {
                    key: 'edit',
                    label: t('common.update'),
                    icon: <EditOutlined />,
                    onClick: () => openEditItem(row),
                  },
                  {
                    key: 'delete',
                    label: t('common.delete'),
                    icon: <DeleteOutlined />,
                    danger: true,
                    onClick: () => setDeleteItemId(row.id),
                  },
                ];
                return (
                  <div
                    className="erp-table-row-actions flex items-center justify-end"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
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
            } satisfies ColumnsType<ExpenseClaimItem>[number],
          ]
        : []),
    ],
    [canEditItems, isCompact, isNarrow, t],
  );

  if (detailQuery.isLoading) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page erp-profile-page erp-profile-v2 erp-employee-detail-v2 erp-expense-claim-detail-page ${DETAIL_PAGE_V2}`}>
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !claim) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page erp-profile-page erp-profile-v2 erp-employee-detail-v2 ${DETAIL_PAGE_V2}`}>
        <Alert
          type="error"
          showIcon
          title={
            detailQuery.error instanceof ApiRequestError
              ? detailQuery.error.message
              : t('hr.messages.expenseClaimNotFound')
          }
          action={
            <Button onClick={() => router.push('/hr/expense-claims')}>
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
    claim.employeeId !== currentUser.data.id
  ) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page erp-profile-page erp-profile-v2 erp-employee-detail-v2 ${DETAIL_PAGE_V2}`}>
        <div className="flex min-h-[240px] items-center justify-center">
          <Skeleton active paragraph={{ rows: 4 }} />
        </div>
      </div>
    );
  }

  // Back to the list for those who have it in the sidebar; others use Approvals.
  const backHref = canViewTeam ? '/hr/expense-claims' : '/approvals';
  const employeeName = formatExpenseClaimEmployeeName(claim.employee);
  const receiptOkCount = claim.items.length - missingReceiptCount;

  const overflowMenuItems: MenuProps['items'] = [];
  if (claim.approvalRequestId) {
    overflowMenuItems.push({
      key: 'approvals',
      label: t('hr.buttons.viewInApprovals'),
      onClick: () => router.push(`/approvals/${claim.approvalRequestId}`),
    });
  }
  if (canCancel) {
    overflowMenuItems.push({
      key: 'cancel',
      label: t('hr.buttons.cancelClaim'),
      icon: <StopOutlined />,
      danger: true,
      onClick: () => setConfirmCancel(true),
    });
  }

  const showOverflowMenu = isNarrow && overflowMenuItems.length > 0;

  const tableScrollX = screens.lg
    ? 960
    : screens.md
      ? 720
      : screens.sm
        ? 560
        : 420;

  return (
    <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page erp-profile-page erp-profile-v2 erp-employee-detail-v2 erp-expense-claim-detail-page ${DETAIL_PAGE_V2}`}>
      <div className="erp-pro-card erp-profile-identity">
        <div className="erp-employee-toolbar">
          <Button
            type="text"
            icon={<ArrowLeft size={16} aria-hidden />}
            onClick={() => router.push(backHref)}
            aria-label={t('hr.buttons.backToList')}
            className="erp-employee-toolbar-back"
          >
            {isNarrow ? undefined : t('hr.buttons.back')}
          </Button>
          <div className="erp-employee-toolbar-actions flex flex-wrap items-center justify-end gap-2">
            {showOverflowMenu ? (
              <Dropdown
                menu={{ items: overflowMenuItems }}
                trigger={['click']}
              >
                <Button
                  icon={<MoreOutlined />}
                  aria-label={t('common.actions')}
                />
              </Dropdown>
            ) : (
              <>
                {claim.approvalRequestId ? (
                  <Button
                    onClick={() =>
                      router.push(`/approvals/${claim.approvalRequestId}`)
                    }
                    aria-label={t('hr.buttons.viewInApprovals')}
                  >
                    {isCompact
                      ? t('nav.approvals')
                      : t('hr.buttons.viewInApprovals')}
                  </Button>
                ) : null}
                {canCancel ? (
                  <Button
                    danger
                    icon={<StopOutlined />}
                    onClick={() => setConfirmCancel(true)}
                    aria-label={t('hr.buttons.cancelClaim')}
                  >
                    {isCompact ? undefined : t('hr.buttons.cancel')}
                  </Button>
                ) : null}
              </>
            )}
            {canMarkPaid ? (
              <Button type="primary" onClick={() => setMarkPaidOpen(true)}>
                {t('pages.hr.expenseClaim.markPaid')}
              </Button>
            ) : null}
            {(canEditHeader || canEditItems || canManage) ? (
              <Space.Compact>
                {canEditHeader ? (
                  <Button
                    icon={<EditOutlined />}
                    onClick={() =>
                      router.push(`/hr/expense-claims/${claimId}/edit`)
                    }
                    aria-label={t('common.update')}
                  >
                    {isNarrow ? undefined : t('common.update')}
                  </Button>
                ) : null}
                {canEditItems && isDraft ? (
                  // Drafts only: a returned claim is resubmitted from Approvals.
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    disabled={!canSubmit}
                    onClick={() => setConfirmSubmit(true)}
                    aria-label={t('hr.buttons.submitClaim')}
                  >
                    {isNarrow ? undefined : t('hr.buttons.submitClaim')}
                  </Button>
                ) : null}
                {canManage ? (
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => setConfirmDeleteClaim(true)}
                    aria-label={t('common.delete')}
                  >
                    {isNarrow ? undefined : t('common.delete')}
                  </Button>
                ) : null}
              </Space.Compact>
            ) : null}
          </div>
        </div>

        <div className="erp-employee-hero erp-profile-hero erp-contract-hero">
          <div className="erp-employee-hero-copy min-w-0 flex-1">
            <div className="erp-profile-hero-badges mb-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span className="erp-users-id-chip">{claim.claimNumber}</span>
              <StatusBadge
                label={formatExpenseClaimStatus(claim.status, t)}
                variant={expenseClaimStatusVariant(claim.status)}
              />
            </div>
            <div className="flex min-w-0 flex-wrap items-baseline justify-center gap-2 sm:justify-start">
              <h2 className="erp-users-name erp-employee-hero-name m-0 break-words">
                {claim.title}
              </h2>
            </div>
            <p className="erp-users-email m-0 mt-1.5 break-words sm:text-left">
              {employeeName}
            </p>
          </div>
        </div>

        <div className="erp-users-stat-bar erp-employee-meta-bar erp-profile-meta">
          <div className="erp-users-stat">
            <div className="min-w-0">
              <p className="erp-users-stat-label">{t('hr.table.items')}</p>
              <p className="erp-employee-meta-value">{claim.items.length}</p>
            </div>
          </div>
          <div className="erp-users-stat">
            <div className="min-w-0">
              <p className="erp-users-stat-label">{t('hr.table.total')}</p>
              <p className="erp-employee-meta-value erp-expense-claim-total">
                {formatEtbAmount(claim.totalAmountEtb)}
              </p>
            </div>
          </div>
          <div className="erp-users-stat">
            <div className="min-w-0">
              <p className="erp-users-stat-label">{t('hr.form.receipt')}</p>
              <p className="erp-employee-meta-value">
                {claim.items.length === 0
                  ? '-'
                  : `${receiptOkCount}/${claim.items.length}`}
              </p>
            </div>
          </div>
          <div className="erp-users-stat">
            <div className="min-w-0">
              <p className="erp-users-stat-label">
                {claim.submittedAt
                  ? t('hr.table.submittedDate')
                  : t('hr.table.createdDate')}
              </p>
              <p className="erp-employee-meta-value">
                {formatProjectDate(claim.submittedAt ?? claim.createdAt)}
              </p>
            </div>
          </div>
          <div className="erp-users-stat">
            <div className="min-w-0">
              <p className="erp-users-stat-label">
                {t('pages.hr.expenseClaim.paid')}
              </p>
              <p className="erp-employee-meta-value">
                {claim.paidAt ? (
                  formatProjectDate(claim.paidAt)
                ) : claim.status === 'APPROVED' ? (
                  t('pages.hr.expenseClaim.unpaid')
                ) : (
                  '-'
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {claim.paidAt ? (
        <div className="erp-pro-card px-4 py-3 sm:px-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
            <div className="min-w-0">
              <p className="erp-users-stat-label m-0 mb-1">
                {t('pages.hr.expenseClaim.paidAt')}
              </p>
              <p className="erp-employee-meta-value m-0">
                {formatProjectDate(claim.paidAt)}
              </p>
            </div>
            <div className="min-w-0">
              <p className="erp-users-stat-label m-0 mb-1">
                {t('pages.hr.expenseClaim.paymentReference')}
              </p>
              <p className="erp-employee-meta-value m-0">
                {claim.paymentReference ?? '-'}
              </p>
            </div>
            <div className="min-w-0">
              <p className="erp-users-stat-label m-0 mb-1">
                {t('pages.hr.expenseClaim.paidBy')}
              </p>
              <p className="erp-employee-meta-value m-0">
                {claim.paidBy
                  ? formatExpenseClaimEmployeeName(claim.paidBy)
                  : '-'}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {isDraft && missingReceiptCount > 0 ? (
        <Alert
          type="warning"
          showIcon
          title={t('hr.messages.expenseClaimMissingReceipts', {
            count: missingReceiptCount,
          })}
        />
      ) : null}

      <div className="grid grid-cols-1 items-start gap-3 sm:gap-4 lg:grid-cols-[1fr_300px]">
        <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
          <section
            className="erp-pro-card erp-ot-entries min-w-0"
            aria-labelledby="expense-items-title"
          >
            <div className="erp-ot-entries-header">
              <h3 id="expense-items-title" className="erp-ot-entries-title">
                {t('hr.section.items')}
                <span className="erp-ot-entries-count">
                  {claim.items.length.toLocaleString()}
                </span>
              </h3>
              <div className="erp-ot-entries-actions">
                <Button
                  icon={<DownloadOutlined />}
                  loading={exporting}
                  disabled={claim.items.length === 0}
                  onClick={() => void handleExportItems()}
                  aria-label={t('pages.hr.expenseClaim.exportItems')}
                >
                  {isNarrow
                    ? undefined
                    : t('pages.hr.expenseClaim.exportItems')}
                </Button>
                {canEditItems ? (
                  <>
                    <Button
                      icon={<UploadOutlined />}
                      onClick={() => setImportOpen(true)}
                      aria-label={t('common.importFromExcel')}
                    >
                      {isNarrow ? undefined : t('common.importFromExcel')}
                    </Button>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={openAddItem}
                    >
                      {t('hr.buttons.addItem')}
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
            <DocumentPreviewGroup
              documents={claim.items.flatMap(itemReceiptDocuments)}
            >
              <DataTable<ExpenseClaimItem>
                rowKey="id"
                className="erp-pro-table erp-users-table"
                size="middle"
                tableLayout="fixed"
                columns={columns}
                dataSource={claim.items}
                pagination={false}
                scroll={{ x: tableScrollX }}
                locale={{
                  emptyText: (
                    <TableEmptyState
                      icon={<Receipt size={28} strokeWidth={1.5} />}
                      title={t('hr.empty.noItems')}
                      description={t(
                        'pages.hr.expenseClaim.itemsStepDescription',
                      )}
                      action={
                        canEditItems
                          ? {
                              label: t('hr.buttons.addItem'),
                              onClick: openAddItem,
                            }
                          : undefined
                      }
                    />
                  ),
                }}
              />
            </DocumentPreviewGroup>
          </section>

          {claim.description?.trim() ? (
            <DetailSection
              title={t('hr.form.description')}
              className="min-w-0"
            >
              <p className="m-0 max-w-2xl whitespace-pre-wrap break-words leading-relaxed text-[13px] text-[#1a1a1a]">
                {claim.description}
              </p>
            </DetailSection>
          ) : null}
        </div>

        <aside className="flex min-w-0 flex-col gap-3 sm:gap-4 lg:sticky lg:top-4">
          {approvalRequest ? (
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

      <ExpenseClaimItemModal
        open={itemModalOpen}
        claimId={claimId}
        editingItem={editingItem}
        onClose={() => {
          setItemModalOpen(false);
          setEditingItem(null);
        }}
      />

      <Modal
        open={markPaidOpen}
        centered
        width={520}
        title={t('pages.hr.expenseClaim.markPaidTitle')}
        onCancel={() => {
          setMarkPaidOpen(false);
          markPaidForm.resetFields();
        }}
        onOk={() => void handleMarkPaid()}
        confirmLoading={markPaidMutation.isPending}
        okText={t('pages.hr.expenseClaim.markPaid')}
        destroyOnHidden
        rootClassName="erp-hr-travel-modal"
        className="erp-hr-travel-modal"
      >
        <p className="erp-hr-travel-modal-hint">
          {t('pages.hr.expenseClaim.markPaidDescription')}
        </p>
        <Form
          form={markPaidForm}
          layout="vertical"
          initialValues={{ paidDate: dayjs() }}
        >
          <Form.Item
            name="paidDate"
            label={t('pages.hr.expenseClaim.paidAt')}
            rules={[{ required: true, message: t('hr.validation.required') }]}
          >
            <DatePicker className="w-full" format="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item
            name="paymentReference"
            label={t('pages.hr.expenseClaim.paymentReference')}
            className="mb-0"
          >
            <Input
              maxLength={100}
              placeholder={t('pages.hr.expenseClaim.paymentReferencePlaceholder')}
            />
          </Form.Item>
        </Form>
      </Modal>

      <ConfirmDialog
        open={confirmSubmit}
        className="erp-hr-travel-modal"
        title={t('hr.dialog.submitExpenseClaimTitle')}
        description={t('hr.dialog.submitExpenseClaimDesc')}
        confirmLabel={t('hr.buttons.submitClaim')}
        confirmLoading={submitMutation.isPending}
        onConfirm={() => void handleSubmit()}
        onCancel={() => setConfirmSubmit(false)}
      />

      <ConfirmDialog
        open={confirmCancel}
        className="erp-hr-travel-modal"
        title={t('hr.dialog.cancelExpenseClaimTitle')}
        description={t('hr.dialog.cancelExpenseClaimDesc')}
        confirmLabel={t('hr.buttons.cancelClaim')}
        danger
        confirmLoading={cancelMutation.isPending}
        onConfirm={() => void handleCancel()}
        onCancel={() => setConfirmCancel(false)}
      />

      <ConfirmDialog
        open={confirmDeleteClaim}
        className="erp-hr-travel-modal"
        title={t('hr.empty.deleteExpenseClaimTitle')}
        description={t('hr.empty.deleteExpenseClaimDescription')}
        confirmLabel={t('common.delete')}
        danger
        confirmLoading={deleteClaimMutation.isPending}
        onConfirm={() => void handleDeleteClaim()}
        onCancel={() => setConfirmDeleteClaim(false)}
      />

      <ConfirmDialog
        open={Boolean(deleteItemId)}
        className="erp-hr-travel-modal"
        title={t('hr.dialog.deleteExpenseClaimItemTitle')}
        description={t('hr.dialog.deleteExpenseClaimItemDesc')}
        confirmLabel={t('common.delete')}
        danger
        confirmLoading={deleteItemMutation.isPending}
        onConfirm={() => void handleDeleteItem()}
        onCancel={() => setDeleteItemId(null)}
      />

      {importOpen ? (
        <HrImportModal
          entity="expenseClaimItems"
          onClose={() => setImportOpen(false)}
          onImported={(summary) => {
            messageApi.success(summary);
            void detailQuery.refetch();
          }}
          downloadTemplate={() =>
            downloadExpenseClaimItemsImportTemplate(claimId)
          }
          previewMutation={itemsImportPreview}
          commitMutation={itemsImportCommit}
        />
      ) : null}
    </div>
  );
}
