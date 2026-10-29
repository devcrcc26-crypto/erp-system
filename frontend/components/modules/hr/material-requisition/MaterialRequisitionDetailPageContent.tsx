'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';
import { useMemo, useState } from 'react';
import {
  Button,
  Dropdown,
  Form,
  Grid,
  Input,
  InputNumber,
  Modal,
  Skeleton,
  Space,
  Tooltip,
} from 'antd';
import type { MenuProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DownloadOutlined,
  FilePdfOutlined,
  MoreOutlined,
  StopOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { ArrowLeft, Inbox, Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import HrImportModal from '@/components/modules/hr/HrImportModal';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DataTable from '@/components/ui/DataTable/DataTable';
import HorizontalScrollHint from '@/components/ui/HorizontalScrollHint/HorizontalScrollHint';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import type {
  MaterialRequisitionItem,
  UpdateMaterialRequisitionItemPayload,
} from '@/lib/api/material-requisition.types';
import {
  downloadMaterialRequisitionItemsImportTemplate,
  useCancelMaterialRequisition,
  useDeleteMaterialRequisitionItem,
  useMaterialRequisition,
  useMaterialRequisitionItemsImport,
  useMaterialRequisitionItemsImportPreview,
  useUpdateMaterialRequisitionItem,
} from '@/lib/query/material-requisition';
import { useCurrentUser } from '@/lib/query/profile';
import { useAuthStore } from '@/stores/auth.store';
import {
  formatMaterialRequisitionEmployeeName,
  formatMaterialRequisitionStatus,
  materialRequisitionStatusVariant,
} from '@/lib/utils/material-requisition-display';
import { exportMaterialRequisitionDetailItemsExcel } from '@/lib/utils/material-requisition-export-excel';
import { openMaterialRequisitionPdf } from '@/lib/query/material-requisition';
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
 * Material requisition detail - Users / employee profile chrome.
 */
export default function MaterialRequisitionDetailPageContent({
  requisitionId,
}: {
  requisitionId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;
  const canViewHr = useCanViewHr();
  const currentUser = useCurrentUser();
  const authUser = useAuthStore((state) => state.user);
  const detailQuery = useMaterialRequisition(requisitionId);
  const cancelMutation = useCancelMaterialRequisition(requisitionId);
  const deleteItemMutation = useDeleteMaterialRequisitionItem(requisitionId);
  const updateItemMutation = useUpdateMaterialRequisitionItem(requisitionId);
  const itemsImportPreview =
    useMaterialRequisitionItemsImportPreview(requisitionId);
  const itemsImportCommit = useMaterialRequisitionItemsImport(requisitionId);

  const [editingItem, setEditingItem] =
    useState<MaterialRequisitionItem | null>(null);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [itemForm] = Form.useForm<UpdateMaterialRequisitionItemPayload>();

  useSetHeaderExtra(null);

  const requisition = detailQuery.data;
  const isOwner =
    Boolean(requisition) && requisition?.employeeId === currentUser.data?.id;
  const isDraftOrReturned =
    requisition?.status === 'DRAFT' || requisition?.status === 'RETURNED';
  const canEdit = Boolean((isOwner || canViewHr) && isDraftOrReturned);
  const canCancel =
    Boolean(isOwner) &&
    (requisition?.status === 'DRAFT' || requisition?.status === 'SUBMITTED');
  // Returned: the Approvals page holds the single Resubmit action.
  const requiresAction =
    Boolean(isOwner) &&
    requisition?.status === 'RETURNED' &&
    Boolean(requisition.approvalRequestId);

  const tiers = useMemo(
    () => (requisition?.approvalRequest?.tiers ?? []) as ApprovalTier[],
    [requisition?.approvalRequest?.tiers],
  );

  function openEditItem(item: MaterialRequisitionItem): void {
    setEditingItem(item);
  }

  function closeEditItem(): void {
    setEditingItem(null);
  }

  async function handleUpdateItem(): Promise<void> {
    if (!editingItem) {
      return;
    }
    try {
      const values = await itemForm.validateFields();
      await updateItemMutation.mutateAsync({
        itemId: editingItem.id,
        payload: {
          itemName: values.itemName,
          itemCode: (values.itemCode as string | undefined) || undefined,
          description: (values.description as string | undefined) || undefined,
          quantity: Number(values.quantity),
          unit: values.unit,
        },
      });
      messageApi.success(t('hr.messages.materialRequisitionItemUpdated'));
      closeEditItem();
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.materialRequisitionItemUpdateFailed'),
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
      messageApi.success(t('hr.messages.materialRequisitionItemRemoved'));
      setDeleteItemId(null);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.materialRequisitionItemRemoveFailed'),
        messageApi,
        t,
      );
    }
  }

  async function handleCancel(): Promise<void> {
    try {
      await cancelMutation.mutateAsync();
      messageApi.success(t('hr.messages.materialRequisitionCancelled'));
      setConfirmCancel(false);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.materialRequisitionCancelFailed'),
        messageApi,
        t,
      );
    }
  }

  async function handleExportItems(): Promise<void> {
    if (!requisition) {
      return;
    }
    setExporting(true);
    try {
      await exportMaterialRequisitionDetailItemsExcel({
        companyName: authUser?.companyName ?? 'Company',
        sheetName: t(
          'pages.hr.materialRequisition.exportRequisitionItemsSheetName',
        ),
        requisition,
      });
      messageApi.success(t('pages.hr.materialRequisition.exportItemsSuccess'));
    } catch {
      messageApi.error(t('pages.hr.materialRequisition.exportError'));
    } finally {
      setExporting(false);
    }
  }

  async function handleExportPdf(): Promise<void> {
    if (!requisition) return;
    setExportingPdf(true);
    try {
      await openMaterialRequisitionPdf(requisition.id);
      messageApi.success(t('pages.hr.materialRequisition.exportPdfSuccess'));
    } catch {
      messageApi.error(t('pages.hr.materialRequisition.exportPdfError'));
    } finally {
      setExportingPdf(false);
    }
  }

  const itemColumns: ColumnsType<MaterialRequisitionItem> = useMemo(
    () => [
      {
        title: t('hr.table.itemName'),
        dataIndex: 'itemName',
        key: 'itemName',
        ellipsis: true,
        render: (value: string) => (
          <span className="erp-users-cell-strong">{value}</span>
        ),
      },
      {
        title: t('hr.table.itemCode'),
        dataIndex: 'itemCode',
        key: 'itemCode',
        width: 120,
        responsive: ['md'],
        render: (value: string | null | undefined) => (
          <span className="erp-users-cell-sub">{value || '-'}</span>
        ),
      },
      {
        title: t('hr.table.description'),
        dataIndex: 'description',
        key: 'description',
        ellipsis: true,
        responsive: ['lg'],
        render: (value: string | null | undefined) => (
          <span className="erp-users-cell-sub">{value || '-'}</span>
        ),
      },
      {
        title: t('hr.table.quantity'),
        dataIndex: 'quantity',
        key: 'quantity',
        width: 90,
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
        render: (value: string) => (
          <span className="erp-users-cell-sub">{value}</span>
        ),
      },
      ...(canEdit
        ? [
            {
              title: '',
              key: 'actions',
              width: 80,
              render: (_: unknown, row: MaterialRequisitionItem) => (
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
            } satisfies ColumnsType<MaterialRequisitionItem>[number],
          ]
        : []),
    ],
    [canEdit, t],
  );

  if (detailQuery.isLoading) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page erp-material-requisition-detail-page ${DETAIL_PAGE_V2}`}>
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !requisition) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page ${DETAIL_PAGE_V2}`}>
        <ErpNotice
          tone="error"
          title={getFriendlyApiErrorMessage(
            detailQuery.error,
            t('hr.messages.materialRequisitionNotFound'),
            t,
          )}
          action={
            <Button onClick={() => router.push('/hr/material-requisition')}>
              {t('hr.buttons.back')}
            </Button>
          }
        />
      </div>
    );
  }

  const employeeName = formatMaterialRequisitionEmployeeName(
    requisition.employee,
  );
  const backHref = '/hr/material-requisition';

  const overflowMenuItems: MenuProps['items'] = [];
  if (requisition.approvalRequestId) {
    overflowMenuItems.push({
      key: 'approvals',
      label: t('hr.buttons.viewInApprovals'),
      onClick: () =>
        router.push(`/approvals/${requisition.approvalRequestId}`),
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
  const tableScrollX = screens.lg
    ? 900
    : screens.md
      ? 700
      : screens.sm
        ? 540
        : 400;

  return (
    <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page erp-material-requisition-detail-page ${DETAIL_PAGE_V2}`}>
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
              aria-label={t('pages.hr.materialRequisition.exportPdf')}
            >
              {isNarrow
                ? undefined
                : t('pages.hr.materialRequisition.exportPdf')}
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
                {requisition.approvalRequestId ? (
                  <Button
                    type={requiresAction ? 'primary' : 'default'}
                    onClick={() =>
                      router.push(
                        `/approvals/${requisition.approvalRequestId}`,
                      )
                    }
                    aria-label={
                      t('hr.buttons.viewInApprovals')
                    }
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
          </div>
        </div>

        <div className="erp-employee-hero erp-contract-hero">
          <div className="erp-employee-hero-copy min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span className="erp-users-id-chip">
                {requisition.requestNumber}
              </span>
              <StatusBadge
                label={formatMaterialRequisitionStatus(requisition.status, t)}
                variant={materialRequisitionStatusVariant(requisition.status)}
              />
            </div>
            <div className="flex min-w-0 flex-wrap items-baseline justify-center gap-2 sm:justify-start">
              <h2 className="erp-users-name erp-employee-hero-name m-0 break-words">
                {requisition.title}
              </h2>
            </div>
            <p className="erp-users-email m-0 mt-1.5 break-words sm:text-left">
              {employeeName}
              {requisition.submittedAt
                ? ` · ${formatProjectDate(requisition.submittedAt)}`
                : null}
            </p>
          </div>
        </div>
      </div>

      <div className="erp-users-stat-bar erp-employee-meta-bar erp-contract-meta-bar">
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.table.items')}</p>
            <p className="erp-employee-meta-value">
              {requisition.items.length}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.table.requiredBy')}</p>
            <p className="erp-employee-meta-value">
              {requisition.requiredByDate
                ? formatProjectDate(requisition.requiredByDate)
                : '-'}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">
              {t('hr.form.warehouseLocation')}
            </p>
            <p className="erp-employee-meta-value truncate">
              {requisition.warehouseLocation ?? '-'}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">
              {requisition.submittedAt
                ? t('hr.table.submittedDate')
                : t('hr.table.createdDate')}
            </p>
            <p className="erp-employee-meta-value">
              {formatProjectDate(
                requisition.submittedAt ?? requisition.createdAt,
              )}
            </p>
          </div>
        </div>
      </div>

      {requisition.status === 'RETURNED' && isOwner ? (
        <ErpNotice
          tone="warning"
          className="mb-4"
          title={t('hr.messages.materialRequisitionReturned')}
          action={
            requisition.approvalRequestId ? (
              <Button
                size="small"
                onClick={() =>
                  router.push(`/approvals/${requisition.approvalRequestId}`)
                }
              >
                {t('hr.buttons.viewInApprovals')}
              </Button>
            ) : undefined
          }
        />
      ) : null}

      <div className="grid grid-cols-1 items-start gap-3 sm:gap-4 lg:grid-cols-[1fr_300px]">
        <div className="erp-pro-card min-w-0 overflow-hidden">
          <div className="erp-employee-tab-panel erp-contract-detail-body">
            <DetailSection title={t('hr.section.requestDetails')}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <p className="erp-users-stat-label m-0">
                    {t('hr.labels.purpose')}
                  </p>
                  <p className="m-0 mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[#1a1a1a]">
                    {requisition.purpose}
                  </p>
                </div>
                {requisition.warehouseLocation ? (
                  <div>
                    <p className="erp-users-stat-label m-0">
                      {t('hr.form.warehouseLocation')}
                    </p>
                    <p className="erp-users-cell-strong m-0 mt-1">
                      {requisition.warehouseLocation}
                    </p>
                  </div>
                ) : null}
                {requisition.requiredByDate ? (
                  <div>
                    <p className="erp-users-stat-label m-0">
                      {t('hr.form.requiredByDate')}
                    </p>
                    <p className="erp-users-cell-strong m-0 mt-1">
                      {formatProjectDate(requisition.requiredByDate)}
                    </p>
                  </div>
                ) : null}
              </div>
            </DetailSection>

            <DetailSection
              title={t('hr.section.items')}
              bodyClassName="erp-employee-section-body--flush"
              action={
                <Space.Compact>
                  <Button
                    size="small"
                    icon={<DownloadOutlined />}
                    loading={exporting}
                    onClick={() => void handleExportItems()}
                  >
                    {t('pages.hr.materialRequisition.exportItems')}
                  </Button>
                  {canEdit ? (
                    <Button
                      size="small"
                      icon={<UploadOutlined />}
                      onClick={() => setImportOpen(true)}
                    >
                      {t('common.importFromExcel')}
                    </Button>
                  ) : null}
                </Space.Compact>
              }
            >
              <HorizontalScrollHint>
                <DataTable<MaterialRequisitionItem>
                  rowKey="id"
                  className="erp-pro-table erp-users-table"
                  size="small"
                  columns={itemColumns}
                  dataSource={requisition.items}
                  pagination={false}
                  scroll={{ x: tableScrollX }}
                  locale={{
                    emptyText: (
                      <TableEmptyState
                        icon={<Inbox size={28} strokeWidth={1.5} />}
                        title={t('hr.empty.noItems')}
                        description={t(
                          'pages.hr.materialRequisition.itemsStepDescription',
                        )}
                      />
                    ),
                  }}
                  footer={
                    requisition.items.length > 0
                      ? () => (
                          <div className="flex justify-end px-3 py-2 text-sm">
                            <span className="erp-users-cell-sub">
                              {t('hr.form.itemCount', {
                                count: requisition.items.length,
                              })}
                            </span>
                          </div>
                        )
                      : undefined
                  }
                />
              </HorizontalScrollHint>
            </DetailSection>

            {(requisition.documents?.length ?? 0) > 0 ? (
              <DetailSection title={t('hr.section.attachments')}>
                <AttachmentDownloadList documents={requisition.documents!} />
              </DetailSection>
            ) : null}
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-3 sm:gap-4 lg:sticky lg:top-4">
          {tiers.length === 0 ? (
            <div className="erp-pro-card">
              <DetailSection title={t('hr.section.approvalChain')}>
                <p className="erp-users-cell-sub m-0">
                  {t('hr.empty.noApprovalChain')}
                </p>
              </DetailSection>
            </div>
          ) : (
            <ApprovalTierTimeline
              tiers={tiers}
              currentTier={requisition.approvalRequest?.currentTier ?? 1}
            />
          )}
        </aside>
      </div>

      <Modal
        rootClassName="erp-hr-travel-modal"
        className="erp-hr-travel-modal"
        open={Boolean(editingItem)}
        title={t('hr.dialog.editMaterialRequisitionItemTitle')}
        onCancel={closeEditItem}
        onOk={() => void handleUpdateItem()}
        okText={t('hr.buttons.save')}
        confirmLoading={updateItemMutation.isPending}
        width={560}
        forceRender
        afterOpenChange={(open) => {
          if (open && editingItem) {
            itemForm.setFieldsValue({
              itemName: editingItem.itemName,
              itemCode: editingItem.itemCode ?? '',
              description: editingItem.description ?? '',
              quantity: Number(editingItem.quantity),
              unit: editingItem.unit,
            });
            return;
          }
          if (!open) {
            itemForm.resetFields();
          }
        }}
        styles={{ body: { paddingTop: 16 } }}
      >
        <Form form={itemForm} layout="vertical" requiredMark={false}>
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <Form.Item
              name="itemName"
              label={t('hr.form.itemName')}
              rules={[
                {
                  required: true,
                  message: t('hr.validation.itemNameRequired'),
                },
              ]}
            >
              <Input maxLength={200} />
            </Form.Item>
            <Form.Item name="itemCode" label={t('hr.form.itemCode')}>
              <Input maxLength={100} />
            </Form.Item>
            <Form.Item
              name="quantity"
              label={t('hr.form.quantity')}
              rules={[
                {
                  required: true,
                  message: t('hr.validation.quantityRequired'),
                },
              ]}
            >
              <InputNumber min={0.01} className="w-full" />
            </Form.Item>
            <Form.Item
              name="unit"
              label={t('hr.form.unit')}
              rules={[
                { required: true, message: t('hr.validation.unitRequired') },
              ]}
            >
              <Input maxLength={50} />
            </Form.Item>
            <Form.Item
              name="description"
              label={t('hr.form.description')}
              className="sm:col-span-2"
            >
              <Input.TextArea rows={3} maxLength={1000} showCount />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteItemId)}
        className="erp-hr-travel-modal"
        title={t('hr.dialog.deleteMaterialRequisitionItemTitle')}
        description={t('hr.dialog.deleteMaterialRequisitionItemDesc')}
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
        className="erp-hr-travel-modal"
        title={t('hr.dialog.cancelMaterialRequisitionTitle')}
        description={t('hr.dialog.cancelMaterialRequisitionDesc')}
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
          entity="materialRequisitionItems"
          onClose={() => setImportOpen(false)}
          onImported={(summary) => {
            messageApi.success(summary);
            void detailQuery.refetch();
          }}
          downloadTemplate={() =>
            downloadMaterialRequisitionItemsImportTemplate(requisitionId)
          }
          previewMutation={itemsImportPreview}
          commitMutation={itemsImportCommit}
        />
      ) : null}
    </div>
  );
}
