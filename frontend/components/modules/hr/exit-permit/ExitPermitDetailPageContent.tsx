'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';
import '@/components/modules/hr/overtime/overtime-entries-v2.css';

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
  Tag,
  Tooltip,
} from 'antd';
import type { MenuProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { MoreOutlined, StopOutlined } from '@ant-design/icons';
import { ArrowLeft, Inbox, Pencil, Printer, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import { MetaItem } from '@/components/modules/hr/shared/hr-page-chrome';
import { DocumentPreviewGroup } from '@/components/shared/preview';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import FileUploadInput from '@/components/ui/FileUploadInput/FileUploadInput';
import DocumentImageThumb from '@/components/ui/DocumentImageThumb/DocumentImageThumb';
import DataTable from '@/components/ui/DataTable/DataTable';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import type {
  ExitPermitItem,
  UpdateExitPermitItemPayload,
} from '@/lib/api/exit-permit.types';
import {
  useCancelExitPermit,
  useDeleteExitPermitItem,
  useExitPermit,
  useSubmitExitPermit,
  useUpdateExitPermitItem,
} from '@/lib/query/exit-permit';
import { exitPermitItemImages } from '@/lib/utils/exit-permit-item-images';
import {
  openExitPermitDetailPdf,
  openExitPermitGatePassPdf,
} from '@/lib/query/exit-permit';
import { useCurrentUser } from '@/lib/query/profile';
import {
  exitPermitStatusVariant,
  formatExitPermitDepartmentName,
  formatExitPermitDirection,
  formatExitPermitEmployeeName,
  formatExitPermitStatus,
} from '@/lib/utils/exit-permit-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';

import { DETAIL_PAGE_V2 } from '@/components/ui/list-page-v2';
const EXIT_PERMIT_LIST_PATH = '/hr/equipment-and-materials-exit-permit';

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
 * Exit permit detail - Users / employee profile chrome.
 */
export default function ExitPermitDetailPageContent({
  permitId,
}: {
  permitId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;
  const currentUser = useCurrentUser();
  const canViewHr = useCanViewHr();
  const detailQuery = useExitPermit(permitId);
  const submitMutation = useSubmitExitPermit(permitId);
  const cancelMutation = useCancelExitPermit(permitId);
  const deleteItemMutation = useDeleteExitPermitItem(permitId);
  const updateItemMutation = useUpdateExitPermitItem(permitId);

  const [editingItem, setEditingItem] = useState<ExitPermitItem | null>(null);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [itemImageFile, setItemImageFile] = useState<File | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [openingGatePass, setOpeningGatePass] = useState(false);
  const [itemForm] = Form.useForm<UpdateExitPermitItemPayload>();

  useSetHeaderExtra(null);

  const permit = detailQuery.data;
  const isActor =
    Boolean(permit) &&
    (permit?.employeeId === currentUser.data?.id || canViewHr);
  const isDraftOrReturned =
    permit?.status === 'DRAFT' || permit?.status === 'RETURNED';
  const canEdit = Boolean(isActor && isDraftOrReturned);
  // Returned permits are resubmitted from the Approvals page (one Resubmit).
  const canSubmit =
    Boolean(isActor && permit?.status === 'DRAFT') &&
    (permit?.items.length ?? 0) > 0;
  const canCancel =
    Boolean(isActor) &&
    (permit?.status === 'DRAFT' || permit?.status === 'SUBMITTED');
  const isDirectApproved =
    permit?.status === 'APPROVED' && !permit.approvalRequestId;

  const tiers = useMemo(
    () => (permit?.approvalRequest?.tiers ?? []) as ApprovalTier[],
    [permit?.approvalRequest?.tiers],
  );

  function openEditItem(item: ExitPermitItem): void {
    setItemImageFile(null);
    setEditingItem(item);
  }

  function closeEditItem(): void {
    setEditingItem(null);
    setItemImageFile(null);
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
          issue: values.issue?.trim() ? values.issue : undefined,
          quantity:
            values.quantity !== undefined
              ? Number(values.quantity)
              : undefined,
          unit: values.unit?.trim() ? values.unit : undefined,
          file: itemImageFile ?? undefined,
        },
      });
      messageApi.success(t('hr.messages.exitPermitItemUpdated'));
      closeEditItem();
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.exitPermitItemUpdateFailed'),
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
      messageApi.success(t('hr.messages.exitPermitItemRemoved'));
      setDeleteItemId(null);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.exitPermitItemRemoveFailed'),
        messageApi,
        t,
      );
    }
  }

  async function handleCancel(): Promise<void> {
    try {
      await cancelMutation.mutateAsync();
      messageApi.success(t('hr.messages.exitPermitCancelled'));
      setConfirmCancel(false);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.exitPermitCancelFailed'),
        messageApi,
        t,
      );
    }
  }

  async function handleSubmit(): Promise<void> {
    try {
      await submitMutation.mutateAsync([]);
      messageApi.success(t('hr.messages.exitPermitSubmitted'));
      setConfirmSubmit(false);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.exitPermitSubmitFailed'),
        messageApi,
        t,
      );
    }
  }

  const itemColumns: ColumnsType<ExitPermitItem> = useMemo(
    () => [
      {
        title: t('hr.table.itemImage'),
        key: 'image',
        width: 68,
        render: (_: unknown, row: ExitPermitItem) => (
          <DocumentImageThumb
            documentId={row.documentId ?? row.image?.id}
            alt={row.itemName}
            fileName={row.image?.name}
            fileType={row.image?.fileType}
            size={44}
            emptyLabel={t('hr.labels.noItemImage')}
          />
        ),
      },
      {
        title: t('hr.table.itemName'),
        key: 'itemName',
        ellipsis: true,
        render: (_: unknown, row: ExitPermitItem) => (
          <div className="min-w-0">
            <p className="erp-users-cell-strong m-0 truncate">{row.itemName}</p>
            {row.issue?.trim() ? (
              <p className="erp-ot-task m-0 mt-0.5">{row.issue}</p>
            ) : null}
          </div>
        ),
      },
      {
        title: t('hr.table.quantity'),
        dataIndex: 'quantity',
        key: 'quantity',
        width: 110,
        render: (value: number | string, row: ExitPermitItem) => (
          <div>
            <span className="erp-ot-hours-total">{Number(value)}</span>
            {row.unit?.trim() ? (
              <div className="erp-ot-pills">
                <span className="erp-ot-pill" data-kind="site">
                  {row.unit}
                </span>
              </div>
            ) : null}
          </div>
        ),
      },
      ...(canEdit
        ? [
            {
              title: '',
              key: 'actions',
              width: 72,
              fixed: 'right' as const,
              render: (_: unknown, row: ExitPermitItem) => (
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
            } satisfies ColumnsType<ExitPermitItem>[number],
          ]
        : []),
    ],
    [canEdit, t],
  );

  if (detailQuery.isLoading) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page erp-exit-permit-detail-page ${DETAIL_PAGE_V2}`}>
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !permit) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page ${DETAIL_PAGE_V2}`}>
        <ErpNotice
          tone="error"
          title={getFriendlyApiErrorMessage(
            detailQuery.error,
            t('hr.messages.exitPermitNotFound'),
            t,
          )}
          action={
            <Button onClick={() => router.push(EXIT_PERMIT_LIST_PATH)}>
              {t('hr.buttons.back')}
            </Button>
          }
        />
      </div>
    );
  }

  const employeeName = formatExitPermitEmployeeName(permit.employee);
  const totalQuantity = permit.items.reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0,
  );
  const summaryTiles = [
    {
      key: 'direction',
      label: t('hr.table.direction'),
      value: formatExitPermitDirection(permit.direction, t),
      color: permit.direction === 'ENTRANCE' ? 'text-green-700' : 'text-red-700',
    },
    {
      key: 'date',
      label: t('hr.table.date'),
      value: formatProjectDate(permit.date),
      color: 'text-blue-700',
    },
    {
      key: 'department',
      label: t('hr.table.department'),
      value: formatExitPermitDepartmentName(permit.department),
      color: 'text-gray-900',
    },
    {
      key: 'quantity',
      label: t('hr.labels.quantity'),
      value: totalQuantity > 0 ? totalQuantity.toLocaleString() : '-',
      color: totalQuantity > 0 ? 'text-amber-700' : 'text-gray-400',
    },
    {
      key: 'items',
      label: t('hr.table.items'),
      value: permit.items.length > 0 ? permit.items.length.toLocaleString() : '-',
      color: permit.items.length > 0 ? 'text-[#0f6e56]' : 'text-gray-400',
      total: true,
    },
  ];
  const submitLabel = t('hr.buttons.submitRequest');

  const overflowMenuItems: MenuProps['items'] = [];
  if (permit.approvalRequestId) {
    overflowMenuItems.push({
      key: 'approvals',
      label: t('hr.buttons.viewInApprovals'),
      onClick: () => router.push(`/approvals/${permit.approvalRequestId}`),
    });
  }
  if (canSubmit) {
    overflowMenuItems.push({
      key: 'submit',
      label: submitLabel,
      onClick: () => setConfirmSubmit(true),
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

  async function handleExportPdf(): Promise<void> {
    if (!permitId || exportingPdf) return;
    setExportingPdf(true);
    try {
      await openExitPermitDetailPdf(permitId);
    } catch (err) {
      notifyApiError(err, 'Failed to export PDF', messageApi);
    } finally {
      setExportingPdf(false);
    }
  }

  async function handleGatePass(): Promise<void> {
    if (openingGatePass) return;
    setOpeningGatePass(true);
    try {
      await openExitPermitGatePassPdf(permitId);
    } catch (err) {
      notifyApiError(err, t('hr.buttons.gatePassFailed'), messageApi, t);
    } finally {
      setOpeningGatePass(false);
    }
  }

  return (
    <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page erp-exit-permit-detail-page ${DETAIL_PAGE_V2}`}>
      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-employee-toolbar">
          <div className="erp-employee-toolbar-back flex min-w-0 items-center gap-2">
            <Button
              type="text"
              icon={<ArrowLeft size={16} />}
              onClick={() => router.push(EXIT_PERMIT_LIST_PATH)}
              aria-label={t('hr.buttons.back')}
            >
              {isNarrow ? undefined : t('hr.buttons.back')}
            </Button>
          </div>
          <div className="erp-employee-toolbar-actions flex flex-wrap items-center justify-end gap-2">
            {permit.status === 'APPROVED' ? (
              <Button
                type="primary"
                icon={<Printer size={16} />}
                onClick={() => void handleGatePass()}
                loading={openingGatePass}
              >
                {t('hr.buttons.gatePass')}
              </Button>
            ) : null}
            <Button
              onClick={() => void handleExportPdf()}
              loading={exportingPdf}
              disabled={!permit}
            >
              {isNarrow ? 'PDF' : 'Export PDF'}
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
                {permit.approvalRequestId ? (
                  <Button
                    onClick={() =>
                      router.push(`/approvals/${permit.approvalRequestId}`)
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
                {canSubmit ? (
                  <Button
                    type="primary"
                    onClick={() => setConfirmSubmit(true)}
                    aria-label={submitLabel}
                  >
                    {submitLabel}
                  </Button>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className="erp-employee-hero erp-contract-hero">
          <div className="erp-employee-hero-copy min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span className="erp-users-id-chip">{permit.requestNumber}</span>
              <StatusBadge
                label={formatExitPermitStatus(permit.status, t)}
                variant={exitPermitStatusVariant(permit.status)}
              />
              {permit.isOnBehalf ? (
                <Tag color="blue" className="rounded-xl">
                  {t('hr.table.onBehalf')}
                </Tag>
              ) : null}
            </div>
            <div className="flex min-w-0 flex-wrap items-baseline justify-center gap-2 sm:justify-start">
              <h2 className="erp-users-name erp-employee-hero-name m-0 break-words">
                {employeeName}
              </h2>
            </div>
            <p className="erp-users-email m-0 mt-1.5">
              {`${formatExitPermitDirection(permit.direction, t)} · ${formatProjectDate(permit.date)}`}
            </p>
            <p className="erp-users-cell-sub m-0 mt-1">
              {formatExitPermitDepartmentName(permit.department)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4">
        {summaryTiles.map((tile) => (
          <div
            key={tile.key}
            className={`min-w-0 rounded-2xl px-5 py-4 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_4px_16px_rgba(16,24,40,0.06)] ${
              tile.total ? 'bg-[#f0faf6]' : 'bg-white'
            }`}
          >
            <p className="m-0 text-xs font-semibold tracking-[0.06em] text-gray-600 uppercase">
              {tile.label}
            </p>
            <p
              className={`m-0 mt-1 truncate font-semibold tabular-nums ${tile.total ? 'text-2xl' : 'text-xl'} ${tile.color}`}
              title={tile.value}
            >
              {tile.value}
            </p>
          </div>
        ))}
      </div>

      {permit.status === 'RETURNED' && isActor ? (
        <ErpNotice
          tone="warning"
          className="mb-4"
          title={t('pages.hr.exitPermit.returnedNotice')}
          action={
            permit.approvalRequestId ? (
              <Button
                size="small"
                onClick={() =>
                  router.push(`/approvals/${permit.approvalRequestId}`)
                }
              >
                {t('hr.buttons.viewInApprovals')}
              </Button>
            ) : undefined
          }
        />
      ) : null}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_300px]">
        <div className="flex min-w-0 flex-col gap-4">
          <section
            className="erp-pro-card erp-ot-entries min-w-0"
            aria-labelledby="exit-permit-items-title"
          >
            <div className="erp-ot-entries-header">
              <h3 id="exit-permit-items-title" className="erp-ot-entries-title">
                {t('hr.section.items')}
                <span className="erp-ot-entries-count">
                  {permit.items.length.toLocaleString()}
                </span>
              </h3>
            </div>
            <DocumentPreviewGroup documents={exitPermitItemImages(permit.items)}>
              <DataTable<ExitPermitItem>
                rowKey="id"
                className="erp-pro-table erp-users-table"
                size="middle"
                columns={itemColumns}
                dataSource={permit.items}
                pagination={false}
                scroll={canEdit ? { x: 'max-content' } : false}
                locale={{
                  emptyText: (
                    <TableEmptyState
                      icon={<Inbox size={28} strokeWidth={1.5} />}
                      title={t('hr.empty.noItems')}
                      description={t('pages.hr.exitPermit.itemsStepDescription')}
                    />
                  ),
                }}
              />
            </DocumentPreviewGroup>
          </section>

          {(permit.documents?.length ?? 0) > 0 ? (
            <div className="erp-pro-card overflow-hidden">
              <DetailSection title={t('hr.section.attachments')}>
                <AttachmentDownloadList
                  documents={(permit.documents ?? []).map((doc) => ({
                    id: doc.id,
                    name: doc.name,
                    fileType: doc.fileType ?? undefined,
                    fileSizeBytes: doc.fileSizeBytes,
                  }))}
                />
              </DetailSection>
            </div>
          ) : null}
        </div>

        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4">
          <div className="erp-pro-card overflow-hidden">
            <DetailSection title={t('hr.section.requestDetails')}>
              <div className="flex flex-col gap-4">
                <MetaItem label={t('hr.table.submittedBy')}>
                  {formatExitPermitEmployeeName(
                    permit.submitter ?? permit.creator,
                  )}
                </MetaItem>
                {permit.submittedAt ? (
                  <MetaItem label={t('hr.table.submittedDate')}>
                    {formatProjectDate(permit.submittedAt)}
                  </MetaItem>
                ) : null}
                {permit.completedAt ? (
                  <MetaItem label={t('hr.labels.completed')}>
                    {formatProjectDate(permit.completedAt)}
                  </MetaItem>
                ) : null}
              </div>
            </DetailSection>
          </div>
          {isDirectApproved || tiers.length === 0 ? (
            <div className="erp-pro-card overflow-hidden">
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
              currentTier={permit.approvalRequest?.currentTier ?? 1}
            />
          )}
        </aside>
      </div>

      <Modal
        rootClassName="erp-hr-travel-modal"
        className="erp-hr-travel-modal"
        open={Boolean(editingItem)}
        title={t('hr.dialog.editExitPermitItemTitle')}
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
              issue: editingItem.issue ?? '',
              quantity: Number(editingItem.quantity),
              unit: editingItem.unit ?? '',
            });
            return;
          }
          if (!open) {
            itemForm.resetFields();
            setItemImageFile(null);
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
            <Form.Item name="issue" label={t('hr.form.issue')}>
              <Input maxLength={200} />
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
            <Form.Item name="unit" label={t('hr.form.unit')}>
              <Input maxLength={50} />
            </Form.Item>
          </div>
          <Form.Item
            label={t('hr.form.itemImage')}
            extra={
              editingItem?.image
                ? t('hr.hints.replaceItemImage', {
                    name: editingItem.image.name,
                  })
                : t('hr.hints.itemImageOptional')
            }
          >
            {editingItem?.image && !itemImageFile ? (
              <div className="mb-3">
                <DocumentImageThumb
                  documentId={editingItem.documentId ?? editingItem.image.id}
                  alt={editingItem.itemName}
                  size={72}
                  emptyLabel={t('hr.labels.noItemImage')}
                />
              </div>
            ) : null}
            <FileUploadInput
              files={itemImageFile ? [itemImageFile] : []}
              onChange={(nextFiles) => setItemImageFile(nextFiles[0] ?? null)}
              accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
              multiple={false}
              disabled={updateItemMutation.isPending}
            />
          </Form.Item>
        </Form>
      </Modal>

      <ConfirmDialog
        open={confirmSubmit}
        className="erp-hr-travel-modal"
        title={t('hr.dialog.submitExitPermitTitle')}
        description={t('hr.dialog.submitExitPermitDesc')}
        confirmLabel={submitLabel}
        confirmLoading={submitMutation.isPending}
        onConfirm={() => {
          void handleSubmit();
        }}
        onCancel={() => setConfirmSubmit(false)}
      />

      <ConfirmDialog
        open={Boolean(deleteItemId)}
        className="erp-hr-travel-modal"
        title={t('hr.dialog.deleteExitPermitItemTitle')}
        description={t('hr.dialog.deleteExitPermitItemDesc')}
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
        title={t('hr.dialog.cancelExitPermitTitle')}
        description={t('hr.dialog.cancelExitPermitDesc')}
        confirmLabel={t('hr.buttons.cancelRequest')}
        danger
        confirmLoading={cancelMutation.isPending}
        onConfirm={() => {
          void handleCancel();
        }}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  );
}
