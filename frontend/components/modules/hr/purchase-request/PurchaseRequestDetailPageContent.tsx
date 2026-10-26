'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';
import '@/components/modules/hr/overtime/overtime-entries-v2.css';

import { useMemo, useState } from 'react';
import {
  Button,
  Dropdown,
  Grid,
  Skeleton,
  Space,
  Tag,
  Tooltip,
} from 'antd';
import type { MenuProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DownloadOutlined,
  EditOutlined,
  FilePdfOutlined,
  MoreOutlined,
  PlusOutlined,
  SendOutlined,
  StopOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { ArrowLeft, Pencil, ShoppingCart, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { DocumentPreviewGroup } from '@/components/shared/preview';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import HrImportModal from '@/components/modules/hr/HrImportModal';
import PurchaseRequestItemDrawer from '@/components/modules/hr/purchase-request/PurchaseRequestItemDrawer';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import FileUploadInput from '@/components/ui/FileUploadInput/FileUploadInput';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DataTable from '@/components/ui/DataTable/DataTable';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanCreatePurchaseRequest } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import type { PurchaseRequestItem } from '@/lib/api/purchase-request.types';
import {
  downloadPurchaseRequestItemsImportTemplate,
  useCancelPurchaseRequest,
  useDeletePurchaseRequestItem,
  usePurchaseRequest,
  usePurchaseRequestItemsImport,
  usePurchaseRequestItemsImportPreview,
  useSubmitPurchaseRequest,
} from '@/lib/query/purchase-request';
import { useCurrentUser } from '@/lib/query/profile';
import { useAuthStore } from '@/stores/auth.store';
import { exportPurchaseRequestDetailItemsExcel } from '@/lib/utils/purchase-request-export-excel';
import { openPurchaseRequestPdf } from '@/lib/query/purchase-request';
import {
  formatEtbAmount,
  formatPurchaseItemDescription,
  formatPurchaseRequestEmployeeName,
  formatPurchaseRequestStatus,
  purchaseRequestItemImages,
  purchaseRequestStatusVariant,
} from '@/lib/utils/purchase-request-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';

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
 * Purchase request detail - Users / employee profile chrome.
 */
export default function PurchaseRequestDetailPageContent({
  requestId,
}: {
  requestId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;
  const fluidItemsTable = screens.lg !== false;
  const tableScrollX = screens.lg
    ? 960
    : screens.md
      ? 720
      : screens.sm
        ? 560
        : 420;
  const canManagePurchaseRequest = useCanCreatePurchaseRequest();
  const currentUser = useCurrentUser();
  const authUser = useAuthStore((state) => state.user);
  const detailQuery = usePurchaseRequest(requestId);
  const cancelMutation = useCancelPurchaseRequest(requestId);
  const deleteItemMutation = useDeletePurchaseRequestItem(requestId);
  const submitMutation = useSubmitPurchaseRequest(requestId);
  const itemsImportPreview = usePurchaseRequestItemsImportPreview(requestId);
  const itemsImportCommit = usePurchaseRequestItemsImport(requestId);

  const [editingItem, setEditingItem] = useState<PurchaseRequestItem | null>(
    null,
  );
  const [itemDrawerOpen, setItemDrawerOpen] = useState(false);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [supportingFiles, setSupportingFiles] = useState<File[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  useSetHeaderExtra(null);

  const request = detailQuery.data;
  const isOwner =
    Boolean(request) && request?.employeeId === currentUser.data?.id;
  const isDraftOrReturned =
    request?.status === 'DRAFT' || request?.status === 'RETURNED';
  const canEdit = Boolean(
    (isOwner || canManagePurchaseRequest) && isDraftOrReturned,
  );
  const canCancel =
    Boolean(isOwner) &&
    (request?.status === 'DRAFT' || request?.status === 'SUBMITTED');
  const isDirectApproved =
    request?.status === 'APPROVED' && !request.approvalRequestId;

  const tiers = useMemo(
    () => (request?.approvalRequest?.tiers ?? []) as ApprovalTier[],
    [request?.approvalRequest?.tiers],
  );

  function openAddItem(): void {
    setEditingItem(null);
    setItemDrawerOpen(true);
  }

  function openEditItem(item: PurchaseRequestItem): void {
    setEditingItem(item);
    setItemDrawerOpen(true);
  }

  function closeItemDrawer(): void {
    setItemDrawerOpen(false);
    setEditingItem(null);
  }

  async function handleSubmitRequest(): Promise<void> {
    try {
      const updated = await submitMutation.mutateAsync(supportingFiles);
      messageApi.success(t('hr.messages.purchaseRequestSubmitted'));
      setConfirmSubmit(false);
      setSupportingFiles([]);
      if (updated.approvalRequestId) {
        router.push(`/approvals/${updated.approvalRequestId}`);
      }
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.purchaseRequestSubmitFailed'),
        messageApi,
        t,
      );
    }
  }

  async function handleDeleteItem(): Promise<void> {
    if (!deleteItemId) {
      return;
    }
    try {
      await deleteItemMutation.mutateAsync(deleteItemId);
      messageApi.success(t('hr.messages.purchaseRequestItemRemoved'));
      setDeleteItemId(null);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.purchaseRequestItemRemoveFailed'),
        messageApi,
        t,
      );
    }
  }

  async function handleCancel(): Promise<void> {
    try {
      await cancelMutation.mutateAsync();
      messageApi.success(t('hr.messages.purchaseRequestCancelled'));
      setConfirmCancel(false);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.purchaseRequestCancelFailed'),
        messageApi,
        t,
      );
    }
  }

  async function handleExportItems(): Promise<void> {
    if (!request) {
      return;
    }
    setExporting(true);
    try {
      await exportPurchaseRequestDetailItemsExcel({
        companyName: authUser?.companyName ?? 'Company',
        sheetName: t('pages.hr.purchaseRequest.exportRequestItemsSheetName'),
        request,
      });
      messageApi.success(t('pages.hr.purchaseRequest.exportItemsSuccess'));
    } catch {
      messageApi.error(t('pages.hr.purchaseRequest.exportError'));
    } finally {
      setExporting(false);
    }
  }

  async function handleExportPdf(): Promise<void> {
    if (!request) return;
    setExportingPdf(true);
    try {
      await openPurchaseRequestPdf(request.id);
      messageApi.success(t('pages.hr.purchaseRequest.exportPdfSuccess'));
    } catch {
      messageApi.error(t('pages.hr.purchaseRequest.exportPdfError'));
    } finally {
      setExportingPdf(false);
    }
  }

  const itemColumns: ColumnsType<PurchaseRequestItem> = useMemo(
    () => [
      {
        title: t('hr.table.itemName'),
        dataIndex: 'itemName',
        key: 'itemName',
        ellipsis: true,
        ...(fluidItemsTable ? { minWidth: 140 } : {}),
        render: (value: string) => (
          <span className="erp-users-cell-strong">{value}</span>
        ),
      },
      {
        title: t('hr.table.descriptionWithModelSpec'),
        key: 'description',
        width: 180,
        ellipsis: true,
        responsive: ['md'],
        onHeaderCell: () => ({
          style: { width: 180, maxWidth: 180 },
        }),
        onCell: () => ({
          style: { width: 180, maxWidth: 180 },
        }),
        render: (_: unknown, row: PurchaseRequestItem) => (
          <span className="erp-users-cell-sub">
            {formatPurchaseItemDescription(row.description, row.modelSpec)}
          </span>
        ),
      },
      {
        title: t('hr.table.itemImage'),
        key: 'image',
        width: 100,
        responsive: ['lg'],
        render: (_: unknown, row: PurchaseRequestItem) => {
          const docs = purchaseRequestItemImages(row);
          return docs.length > 0 ? (
            <div
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <AttachmentDownloadList compact documents={docs} />
            </div>
          ) : (
            <span className="erp-users-cell-sub text-xs">
              {t('hr.labels.noItemImage')}
            </span>
          );
        },
      },
      {
        title: t('hr.table.quantity'),
        dataIndex: 'quantity',
        key: 'quantity',
        width: 80,
        align: 'right',
        render: (value: number | string) => (
          <span className="erp-users-cell-sub tabular-nums">{value}</span>
        ),
      },
      {
        title: t('hr.table.unit'),
        dataIndex: 'unit',
        key: 'unit',
        width: 80,
        responsive: ['lg'],
        render: (value: string) => (
          <span className="erp-users-cell-sub">{value}</span>
        ),
      },
      {
        title: t('hr.table.unitPrice'),
        key: 'unitPrice',
        width: 120,
        align: 'right',
        responsive: ['md'],
        render: (_: unknown, row: PurchaseRequestItem) => (
          <span className="erp-users-cell-sub tabular-nums">
            {formatEtbAmount(row.unitPrice)}
          </span>
        ),
      },
      {
        title: t('hr.table.total'),
        dataIndex: 'totalPriceEtb',
        key: 'totalPriceEtb',
        width: isNarrow ? 100 : 130,
        align: 'right',
        render: (value: number | string) => (
          <span className="erp-users-cell-strong tabular-nums">
            {formatEtbAmount(value)}
          </span>
        ),
      },
      ...(canEdit
        ? [
            {
              title: '',
              key: 'actions',
              width: 80,
              render: (_: unknown, row: PurchaseRequestItem) => (
                <div
                  className="erp-table-row-actions flex items-center justify-end gap-0.5"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <Tooltip title={t('common.update')}>
                    <Button
                      size="small"
                      type="text"
                      icon={<Pencil size={14} />}
                      onClick={() => openEditItem(row)}
                      aria-label={t('common.update')}
                    />
                  </Tooltip>
                  <Tooltip title={t('common.delete')}>
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<Trash2 size={14} />}
                      onClick={() => setDeleteItemId(row.id)}
                      aria-label={t('common.delete')}
                    />
                  </Tooltip>
                </div>
              ),
            } satisfies ColumnsType<PurchaseRequestItem>[number],
          ]
        : []),
    ],
    [canEdit, fluidItemsTable, isNarrow, t],
  );

  if (detailQuery.isLoading) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page erp-purchase-request-detail-page ${DETAIL_PAGE_V2}`}>
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !request) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page ${DETAIL_PAGE_V2}`}>
        <ErpNotice
          tone="error"
          title={getFriendlyApiErrorMessage(
            detailQuery.error,
            t('hr.messages.purchaseRequestNotFound'),
            t,
          )}
          action={
            <Button onClick={() => router.push('/hr/purchase-requests')}>
              {t('hr.buttons.back')}
            </Button>
          }
        />
      </div>
    );
  }

  const canEditItems = canEdit;
  const canEditHeader = canEdit;
  const canSubmit = canEditItems && request.items.length > 0;
  const employeeName = formatPurchaseRequestEmployeeName(request.employee);
  const backHref = '/hr/purchase-requests';

  const overflowMenuItems: MenuProps['items'] = [];
  if (request.approvalRequestId) {
    overflowMenuItems.push({
      key: 'approvals',
      label: t('hr.buttons.viewInApprovals'),
      onClick: () => router.push(`/approvals/${request.approvalRequestId}`),
    });
  }
  if (canCancel) {
    overflowMenuItems.push({
      key: 'cancel',
      label: t('hr.buttons.cancelRequest'),
      icon: <StopOutlined />,
      danger: true,
      onClick: () => setConfirmCancel(true),
    });
  }

  const showOverflowMenu = isNarrow && overflowMenuItems.length > 0;

  return (
    <div
      className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page erp-purchase-request-detail-page w-full max-w-none ${DETAIL_PAGE_V2}`}
    >
      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-employee-toolbar">
          <div className="erp-employee-toolbar-back flex min-w-0 items-center gap-2">
            <Button
              type="text"
              icon={<ArrowLeft size={16} />}
              onClick={() => router.push(backHref)}
              aria-label={t('hr.buttons.back')}
            >
              {isNarrow ? undefined : t('hr.buttons.back')}
            </Button>
          </div>
          <div className="erp-employee-toolbar-actions flex flex-wrap items-center justify-end gap-2">
            <Button
              icon={<FilePdfOutlined />}
              loading={exportingPdf}
              onClick={handleExportPdf}
              aria-label={t('pages.hr.purchaseRequest.exportPdf')}
            >
              {isNarrow ? undefined : t('pages.hr.purchaseRequest.exportPdf')}
            </Button>
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
                {request.approvalRequestId ? (
                  <Button
                    onClick={() =>
                      router.push(`/approvals/${request.approvalRequestId}`)
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
                    aria-label={t('hr.buttons.cancelRequest')}
                  >
                    {isCompact ? undefined : t('hr.buttons.cancelRequest')}
                  </Button>
                ) : null}
              </>
            )}
            {canEditHeader || canEditItems ? (
              <Space.Compact>
                {canEditHeader ? (
                  <Button
                    icon={<EditOutlined />}
                    onClick={() =>
                      router.push(`/hr/purchase-requests/${requestId}/edit`)
                    }
                    aria-label={t('common.update')}
                  >
                    {isNarrow ? undefined : t('common.update')}
                  </Button>
                ) : null}
                {canEditItems ? (
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    disabled={!canSubmit}
                    onClick={() => setConfirmSubmit(true)}
                    aria-label={t('hr.buttons.submitRequest')}
                  >
                    {isNarrow ? undefined : t('hr.buttons.submitRequest')}
                  </Button>
                ) : null}
              </Space.Compact>
            ) : null}
          </div>
        </div>

        <div className="erp-employee-hero erp-contract-hero">
          <div className="erp-employee-hero-copy min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span className="erp-users-id-chip">{request.requestNumber}</span>
              <StatusBadge
                label={formatPurchaseRequestStatus(request.status, t)}
                variant={purchaseRequestStatusVariant(request.status)}
              />
              {isDirectApproved ? (
                <Tag color="blue">{t('hr.labels.directApproval')}</Tag>
              ) : request.approvalRequestId || isDraftOrReturned ? (
                <Tag color="orange">{t('hr.labels.gmApprovalRequired')}</Tag>
              ) : null}
            </div>
            <div className="flex min-w-0 flex-wrap items-baseline justify-center gap-2 sm:justify-start">
              <h2 className="erp-users-name erp-employee-hero-name m-0 break-words">
                {request.title}
              </h2>
            </div>
            <p className="erp-users-email m-0 mt-1.5 break-words sm:text-left">
              {employeeName}
              {request.submittedAt
                ? ` · ${formatProjectDate(request.submittedAt)}`
                : null}
            </p>
          </div>
        </div>
      </div>

      <div className="erp-users-stat-bar erp-employee-meta-bar erp-contract-meta-bar">
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.table.items')}</p>
            <p className="erp-employee-meta-value">{request.items.length}</p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.form.estimatedTotal')}</p>
            <p className="erp-employee-meta-value erp-purchase-request-total">
              {formatEtbAmount(request.totalEstimatedEtb)}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.table.requiredBy')}</p>
            <p className="erp-employee-meta-value">
              {request.requiredByDate
                ? formatProjectDate(request.requiredByDate)
                : '-'}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">
              {request.submittedAt
                ? t('hr.table.submittedDate')
                : t('hr.table.createdDate')}
            </p>
            <p className="erp-employee-meta-value">
              {formatProjectDate(request.submittedAt ?? request.createdAt)}
            </p>
          </div>
        </div>
      </div>

      {request.status === 'RETURNED' && isOwner ? (
        <ErpNotice
          tone="warning"
          className="mb-4"
          title={t('hr.messages.purchaseRequestReturned')}
          action={
            request.approvalRequestId ? (
              <Button
                size="small"
                onClick={() =>
                  router.push(`/approvals/${request.approvalRequestId}`)
                }
              >
                {t('hr.buttons.viewInApprovals')}
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {canEditItems ? (
        <ErpNotice
          tone="warning"
          title={t('hr.messages.purchaseRequestRequiresGmApproval')}
          description={`${t('hr.form.estimatedTotal')}: ${formatEtbAmount(request.totalEstimatedEtb)}`}
        />
      ) : null}

      <div className="flex w-full min-w-0 flex-col gap-3 sm:gap-4">
        <div className="grid w-full min-w-0 grid-cols-1 items-start gap-3 sm:gap-4 lg:grid-cols-[1fr_300px]">
          <div className="erp-pro-card min-w-0 overflow-hidden">
            <div className="erp-employee-tab-panel erp-contract-detail-body">
              <DetailSection title={t('hr.section.requestDetails')}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <p className="erp-users-stat-label m-0">
                      {t('hr.form.justification')}
                    </p>
                    <p className="m-0 mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[#1a1a1a]">
                      {request.justification}
                    </p>
                  </div>
                  {request.vendorName ? (
                    <div>
                      <p className="erp-users-stat-label m-0">
                        {t('hr.form.vendor')}
                      </p>
                      <p className="erp-users-cell-strong m-0 mt-1">
                        {request.vendorName}
                      </p>
                      {request.vendorEmail ? (
                        <p className="erp-users-cell-sub m-0 mt-0.5">
                          {request.vendorEmail}
                        </p>
                      ) : null}
                      {request.vendorPhone ? (
                        <p className="erp-users-cell-sub m-0 mt-0.5">
                          {request.vendorPhone}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {request.completedAt ? (
                    <div>
                      <p className="erp-users-stat-label m-0">
                        {t('hr.labels.completedAt')}
                      </p>
                      <p className="erp-users-cell-strong m-0 mt-1">
                        {formatProjectDate(request.completedAt)}
                      </p>
                    </div>
                  ) : null}
                </div>
              </DetailSection>
            </div>
          </div>

          <aside className="flex min-w-0 flex-col gap-3 sm:gap-4 lg:sticky lg:top-4">
            {isDirectApproved || tiers.length === 0 ? (
              <div className="erp-pro-card">
                <DetailSection title={t('hr.section.approvalChain')}>
                  <p className="erp-users-cell-sub m-0">
                    {isDirectApproved
                      ? t('hr.messages.directApprovalNoChain')
                      : t('hr.empty.noApprovalChain')}
                  </p>
                </DetailSection>
              </div>
            ) : (
              <ApprovalTierTimeline
                tiers={tiers}
                currentTier={request.approvalRequest?.currentTier ?? 1}
              />
            )}
          </aside>
        </div>

        <section
          className="erp-pro-card erp-ot-entries erp-purchase-request-items-card min-w-0 w-full"
          aria-labelledby="purchase-request-items-title"
        >
            <div className="erp-ot-entries-header">
              <h3
                id="purchase-request-items-title"
                className="erp-ot-entries-title"
              >
                {t('hr.section.items')}
                <span className="erp-ot-entries-count">
                  {request.items.length.toLocaleString()}
                </span>
              </h3>
              <div className="erp-ot-entries-actions">
                <Button
                  icon={<DownloadOutlined />}
                  loading={exporting}
                  disabled={request.items.length === 0}
                  onClick={() => void handleExportItems()}
                  aria-label={t('pages.hr.purchaseRequest.exportItems')}
                >
                  {isNarrow
                    ? undefined
                    : t('pages.hr.purchaseRequest.exportItems')}
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
              documents={request.items.flatMap((item) =>
                purchaseRequestItemImages(item),
              )}
            >
              <DataTable<PurchaseRequestItem>
                rowKey="id"
                className="erp-pro-table erp-users-table w-full erp-purchase-request-items-table"
                size="middle"
                tableLayout={fluidItemsTable ? 'auto' : 'fixed'}
                columns={itemColumns}
                dataSource={request.items}
                pagination={false}
                scroll={fluidItemsTable ? false : { x: tableScrollX }}
                  locale={{
                    emptyText: (
                      <TableEmptyState
                        icon={<ShoppingCart size={28} strokeWidth={1.5} />}
                        title={t('hr.empty.noItems')}
                        description={t(
                          'pages.hr.purchaseRequest.itemsStepDescription',
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
                  footer={
                    request.items.length > 0
                      ? () => (
                          <div className="flex flex-wrap justify-end gap-4 px-3 py-2 text-sm">
                            <span className="erp-users-cell-sub">
                              {t('hr.form.itemCount', {
                                count: request.items.length,
                              })}
                            </span>
                            <span className="erp-users-cell-strong">
                              {t('hr.form.estimatedTotal')}:{' '}
                              {formatEtbAmount(request.totalEstimatedEtb)}
                            </span>
                          </div>
                        )
                      : undefined
                  }
              />
            </DocumentPreviewGroup>
          </section>

        {canEditItems ? (
          <div className="erp-pro-card min-w-0 w-full px-4 py-4 sm:px-5">
              <DetailSection title={t('hr.section.attachments')}>
                <p className="erp-users-cell-sub m-0 mb-3 text-[13px]">
                  {t('pages.hr.purchaseRequest.attachmentsStepDescription')}
                </p>
                <FileUploadInput
                  files={supportingFiles}
                  onChange={setSupportingFiles}
                  multiple
                />
                {(request.documents?.length ?? 0) > 0 ? (
                  <div className="mt-4 border-t border-[#e8ebef] pt-4">
                    <AttachmentDownloadList documents={request.documents!} />
                  </div>
                ) : null}
              </DetailSection>
            </div>
        ) : (request.documents?.length ?? 0) > 0 ? (
          <div className="erp-pro-card min-w-0 w-full px-4 py-4 sm:px-5">
            <DetailSection title={t('hr.section.attachments')}>
              <AttachmentDownloadList documents={request.documents!} />
            </DetailSection>
          </div>
        ) : null}
      </div>

      <PurchaseRequestItemDrawer
        open={itemDrawerOpen}
        requestId={requestId}
        editingItem={editingItem}
        onClose={closeItemDrawer}
      />

      <ConfirmDialog
        open={confirmSubmit}
        className="erp-hr-travel-modal"
        title={t('hr.dialog.submitPurchaseRequestTitle')}
        description={t('hr.dialog.submitPurchaseRequestDesc')}
        confirmLabel={t('hr.buttons.submitRequest')}
        confirmLoading={submitMutation.isPending}
        onConfirm={() => void handleSubmitRequest()}
        onCancel={() => setConfirmSubmit(false)}
      />

      <ConfirmDialog
        open={Boolean(deleteItemId)}
        title={t('hr.dialog.deletePurchaseRequestItemTitle')}
        description={t('hr.dialog.deletePurchaseRequestItemDesc')}
        confirmLabel={t('hr.buttons.removeItem')}
        danger
        confirmLoading={deleteItemMutation.isPending}
        onConfirm={() => {
          void handleDeleteItem();
        }}
        onCancel={() => setDeleteItemId(null)}
      />

      <ConfirmDialog
        open={confirmCancel}
        title={t('hr.dialog.cancelPurchaseRequestTitle')}
        description={t('hr.dialog.cancelPurchaseRequestDesc')}
        confirmLabel={t('hr.buttons.cancelRequest')}
        danger
        confirmLoading={cancelMutation.isPending}
        onConfirm={() => {
          void handleCancel();
        }}
        onCancel={() => setConfirmCancel(false)}
      />

      {importOpen ? (
        <HrImportModal
          entity="purchaseRequestItems"
          onClose={() => setImportOpen(false)}
          onImported={(summary) => {
            messageApi.success(summary);
            void detailQuery.refetch();
          }}
          downloadTemplate={() =>
            downloadPurchaseRequestItemsImportTemplate(requestId)
          }
          previewMutation={itemsImportPreview}
          commitMutation={itemsImportCommit}
        />
      ) : null}
    </div>
  );
}
