'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Dropdown,
  Form,
  Grid,
  Input,
  InputNumber,
  Modal,
  Select,
  Skeleton,
  Tag,
  Tooltip,
} from 'antd';
import type { MenuProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  EditOutlined,
  MoreOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { ArrowLeft, Pencil, ShoppingCart, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import FileUploadInput from '@/components/ui/FileUploadInput/FileUploadInput';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  PurchaseRequestItem,
  SupportedCurrency,
  UpdatePurchaseRequestItemPayload,
} from '@/lib/api/purchase-request.types';
import {
  useCancelPurchaseRequest,
  useDeletePurchaseRequestItem,
  usePurchaseRequest,
  useUpdatePurchaseRequestItem,
} from '@/lib/query/purchase-request';
import { useCurrentUser } from '@/lib/query/profile';
import {
  formatCurrencyAmount,
  formatEtbAmount,
  formatPurchaseItemDescription,
  formatPurchaseItemDescriptionInput,
  parsePurchaseItemDescription,
  formatPurchaseRequestEmployeeName,
  formatPurchaseRequestStatus,
  purchaseRequestStatusVariant,
  requiresGmApproval,
} from '@/lib/utils/purchase-request-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';

const CURRENCY_OPTIONS: { value: SupportedCurrency; label: string }[] = [
  { value: 'ETB', label: 'ETB' },
  { value: 'USD', label: 'USD' },
  { value: 'CNY', label: 'CNY' },
];

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
 * Purchase request detail — Users / employee profile chrome.
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
  const currentUser = useCurrentUser();
  const detailQuery = usePurchaseRequest(requestId);
  const cancelMutation = useCancelPurchaseRequest(requestId);
  const deleteItemMutation = useDeletePurchaseRequestItem(requestId);
  const updateItemMutation = useUpdatePurchaseRequestItem(requestId);

  const [editingItem, setEditingItem] = useState<PurchaseRequestItem | null>(
    null,
  );
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [itemImageFile, setItemImageFile] = useState<File | null>(null);
  const [itemForm] = Form.useForm<
    UpdatePurchaseRequestItemPayload & {
      currency: SupportedCurrency;
      descriptionWithModelSpec?: string;
    }
  >();

  useSetHeaderExtra(null);

  const request = detailQuery.data;
  const isOwner =
    Boolean(request) && request?.employeeId === currentUser.data?.id;
  const isDraftOrReturned =
    request?.status === 'DRAFT' || request?.status === 'RETURNED';
  const canEdit = Boolean(isOwner && isDraftOrReturned);
  const canCancel =
    Boolean(isOwner) &&
    (request?.status === 'DRAFT' || request?.status === 'SUBMITTED');
  const isDirectApproved =
    request?.status === 'APPROVED' && !request.approvalRequestId;

  const tiers = useMemo(
    () => (request?.approvalRequest?.tiers ?? []) as ApprovalTier[],
    [request?.approvalRequest?.tiers],
  );

  function openEditItem(item: PurchaseRequestItem): void {
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
      const { description, modelSpec } = parsePurchaseItemDescription(
        values.descriptionWithModelSpec as string | undefined,
      );
      await updateItemMutation.mutateAsync({
        itemId: editingItem.id,
        payload: {
          itemName: values.itemName,
          modelSpec,
          description,
          quantity: Number(values.quantity),
          unit: values.unit,
          unitPrice: Number(values.unitPrice),
          currency: values.currency,
          file: itemImageFile ?? undefined,
        },
      });
      messageApi.success(t('hr.messages.purchaseRequestItemUpdated'));
      closeEditItem();
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.purchaseRequestItemUpdateFailed'),
        messageApi,
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
      );
    }
  }

  const itemColumns: ColumnsType<PurchaseRequestItem> = useMemo(
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
        title: t('hr.table.descriptionWithModelSpec'),
        key: 'description',
        ellipsis: true,
        responsive: ['md'],
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
        render: (_: unknown, row: PurchaseRequestItem) =>
          row.image ? (
            <AttachmentDownloadList documents={[row.image]} />
          ) : (
            <span className="erp-users-cell-sub text-xs">
              {t('hr.labels.noItemImage')}
            </span>
          ),
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
            {formatCurrencyAmount(row.unitPrice, row.currency)}
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
    [canEdit, isNarrow, t],
  );

  if (detailQuery.isLoading) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-detail-page erp-purchase-request-detail-page">
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !request) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-detail-page">
        <Alert
          type="error"
          showIcon
          title={
            detailQuery.error instanceof ApiRequestError
              ? detailQuery.error.message
              : t('hr.messages.purchaseRequestNotFound')
          }
          action={
            <Button onClick={() => router.push('/hr/purchase-requests')}>
              {t('hr.buttons.back')}
            </Button>
          }
        />
      </div>
    );
  }

  const gmRequired = requiresGmApproval(request.totalEstimatedEtb);
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
  const tableScrollX = screens.lg
    ? 960
    : screens.md
      ? 720
      : screens.sm
        ? 560
        : 420;

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-detail-page erp-purchase-request-detail-page">
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
            {canEdit ? (
              <Button
                type="primary"
                icon={<EditOutlined />}
                onClick={() =>
                  router.push(`/hr/purchase-requests/${requestId}/edit`)
                }
                aria-label={t('common.update')}
              >
                {isNarrow ? undefined : t('common.update')}
              </Button>
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
              ) : gmRequired ? (
                <Tag color="orange">{t('hr.labels.gmApprovalRequired')}</Tag>
              ) : (
                <Tag color="cyan">{t('hr.labels.hrApprovalSufficient')}</Tag>
              )}
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
                : '—'}
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
        <Alert
          type="warning"
          showIcon
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

      <div className="grid grid-cols-1 items-start gap-3 sm:gap-4 lg:grid-cols-[1fr_300px]">
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
                    {request.vendorContact ? (
                      <p className="erp-users-cell-sub m-0 mt-0.5">
                        {request.vendorContact}
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

            <DetailSection
              title={t('hr.section.items')}
              bodyClassName="!p-0"
            >
              <DataTable<PurchaseRequestItem>
                rowKey="id"
                className="erp-pro-table erp-users-table"
                size="small"
                columns={itemColumns}
                dataSource={request.items}
                pagination={false}
                scroll={{ x: tableScrollX }}
                locale={{
                  emptyText: (
                    <TableEmptyState
                      icon={<ShoppingCart size={28} strokeWidth={1.5} />}
                      title={t('hr.empty.noItems')}
                      description={t(
                        'pages.hr.purchaseRequest.itemsStepDescription',
                      )}
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
            </DetailSection>

            {(request.documents?.length ?? 0) > 0 ? (
              <DetailSection title={t('hr.section.attachments')}>
                <AttachmentDownloadList documents={request.documents!} />
              </DetailSection>
            ) : null}
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

      <Modal
        open={Boolean(editingItem)}
        title={t('hr.dialog.editPurchaseRequestItemTitle')}
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
              descriptionWithModelSpec: formatPurchaseItemDescriptionInput(
                editingItem.description,
                editingItem.modelSpec,
              ),
              quantity: Number(editingItem.quantity),
              unit: editingItem.unit,
              unitPrice: Number(editingItem.unitPrice),
              currency: editingItem.currency,
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
            <Form.Item
              name="descriptionWithModelSpec"
              label={t('hr.form.descriptionWithModelSpec')}
              className="sm:col-span-2"
            >
              <Input.TextArea
                rows={2}
                maxLength={1502}
                showCount
                placeholder={t('hr.placeholder.enterDescriptionWithModelSpec')}
              />
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
              <InputNumber min={0.001} className="w-full" />
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
              name="unitPrice"
              label={t('hr.form.unitPrice')}
              rules={[
                {
                  required: true,
                  message: t('hr.validation.unitPriceRequired'),
                },
              ]}
            >
              <InputNumber min={0} className="w-full" />
            </Form.Item>
            <Form.Item
              name="currency"
              label={t('hr.form.currency')}
              rules={[{ required: true }]}
            >
              <Select options={CURRENCY_OPTIONS} />
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
    </div>
  );
}
