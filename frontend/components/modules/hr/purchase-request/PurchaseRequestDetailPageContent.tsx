'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import FileUploadInput from '@/components/ui/FileUploadInput/FileUploadInput';
import DataTable from '@/components/ui/DataTable/DataTable';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
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
import { tokens } from '@/lib/theme/tokens';

const CURRENCY_OPTIONS: { value: SupportedCurrency; label: string }[] = [
  { value: 'ETB', label: 'ETB' },
  { value: 'USD', label: 'USD' },
  { value: 'CNY', label: 'CNY' },
];

/**
 * Purchase request detail — aligned with Vehicle Refueling chrome.
 */
export default function PurchaseRequestDetailPageContent({
  requestId,
}: {
  requestId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
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
    UpdatePurchaseRequestItemPayload & { currency: SupportedCurrency }
  >();

  const request = detailQuery.data;
  const isOwner =
    Boolean(request) && request?.employeeId === currentUser.data?.id;
  const isDraftOrReturned =
    request?.status === 'DRAFT' || request?.status === 'RETURNED';
  const canEdit = isOwner && isDraftOrReturned;
  const canCancel =
    isOwner &&
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

  if (detailQuery.isLoading) {
    return (
      <div className="erp-pro-list-page flex flex-col gap-3">
        <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !request) {
    return (
      <div className="erp-pro-list-page flex flex-col gap-3">
        <Alert
          type="error"
          showIcon
          title={
            detailQuery.error instanceof ApiRequestError
              ? detailQuery.error.message
              : t('hr.messages.purchaseRequestNotFound')
          }
          action={
            <Button
              onClick={() => router.push('/hr/purchase-requests')}
              style={{ borderRadius: 0 }}
            >
              {t('hr.buttons.back')}
            </Button>
          }
        />
      </div>
    );
  }

  const gmRequired = requiresGmApproval(request.totalEstimatedEtb);

  const itemColumns: ColumnsType<PurchaseRequestItem> = [
    {
      title: t('hr.table.itemName'),
      dataIndex: 'itemName',
      key: 'itemName',
      ellipsis: true,
    },
    {
      title: t('hr.table.descriptionWithModelSpec'),
      key: 'description',
      ellipsis: true,
      render: (_: unknown, row: PurchaseRequestItem) =>
        formatPurchaseItemDescription(row.description, row.modelSpec),
    },
    {
      title: t('hr.table.itemImage'),
      key: 'image',
      width: 120,
      render: (_: unknown, row: PurchaseRequestItem) =>
        row.image ? (
          <AttachmentDownloadList documents={[row.image]} />
        ) : (
          <Typography.Text type="secondary" className="text-xs">
            {t('hr.labels.noItemImage')}
          </Typography.Text>
        ),
    },
    {
      title: t('hr.table.quantity'),
      dataIndex: 'quantity',
      key: 'quantity',
      width: 70,
      align: 'right',
    },
    { title: t('hr.table.unit'), dataIndex: 'unit', key: 'unit', width: 80 },
    {
      title: t('hr.table.unitPrice'),
      key: 'unitPrice',
      width: 130,
      align: 'right',
      render: (_: unknown, row: PurchaseRequestItem) =>
        formatCurrencyAmount(row.unitPrice, row.currency),
    },
    {
      title: t('hr.table.total'),
      dataIndex: 'totalPriceEtb',
      key: 'totalPriceEtb',
      width: 130,
      align: 'right',
      render: (value: number | string) => formatEtbAmount(value),
    },
    ...(canEdit
      ? [
          {
            title: '',
            key: 'actions',
            width: 80,
            render: (_: unknown, row: PurchaseRequestItem) => (
              <Space size={4}>
                <Button
                  size="small"
                  type="text"
                  icon={<Pencil size={14} />}
                  onClick={() => openEditItem(row)}
                  style={{ borderRadius: 0 }}
                />
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<Trash2 size={14} />}
                  onClick={() => setDeleteItemId(row.id)}
                  style={{ borderRadius: 0 }}
                />
              </Space>
            ),
          } satisfies ColumnsType<PurchaseRequestItem>[number],
        ]
      : []),
  ];

  return (
    <div className="erp-pro-list-page flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="text"
          icon={<ArrowLeft size={16} />}
          onClick={() => router.push('/hr/purchase-requests')}
          style={{ borderRadius: 0 }}
        >
          {t('hr.buttons.back')}
        </Button>
        <Space wrap size={8} className="ml-auto">
          {canEdit ? (
            <Button
              type="text"
              icon={<Pencil size={14} />}
              onClick={() =>
                router.push(`/hr/purchase-requests/${requestId}/edit`)
              }
              style={{ borderRadius: 0, color: tokens.colorPrimary }}
            >
              {t('common.update')}
            </Button>
          ) : null}
          {canCancel ? (
            <Button
              danger
              onClick={() => setConfirmCancel(true)}
              style={{ borderRadius: 0 }}
            >
              {t('hr.buttons.cancelRequest')}
            </Button>
          ) : null}
        </Space>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-3">
          <div
            className="overflow-hidden rounded-none"
            style={{
              background: tokens.colorCardBg,
              border: `1px solid ${tokens.colorBorder}`,
            }}
          >
            <div className="px-3 py-4 sm:px-5">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: tokens.colorTextTertiary }}
                >
                  {request.requestNumber}
                </span>
                <span style={{ color: tokens.colorBorder }}>·</span>
                <StatusBadge
                  label={formatPurchaseRequestStatus(request.status, t)}
                  variant={purchaseRequestStatusVariant(request.status)}
                />
                {isDirectApproved ? (
                  <Tag color="blue">{t('hr.labels.directApproval')}</Tag>
                ) : gmRequired ? (
                  <Tag color="orange">
                    {t('hr.labels.gmApprovalRequired')}
                  </Tag>
                ) : (
                  <Tag color="cyan">
                    {t('hr.labels.hrApprovalSufficient')}
                  </Tag>
                )}
              </div>
              <h2
                className="m-0 text-lg font-semibold leading-snug"
                style={{ color: tokens.colorTextPrimary }}
              >
                {request.title}
              </h2>
              <p
                className="m-0 mt-1 text-sm"
                style={{ color: tokens.colorTextSecondary }}
              >
                {formatPurchaseRequestEmployeeName(request.employee)}
                {request.submittedAt
                  ? ` · ${formatProjectDate(request.submittedAt)}`
                  : null}
              </p>
            </div>

            {request.status === 'RETURNED' && isOwner ? (
              <div
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-5"
                style={{
                  background: tokens.colorAmber50,
                  borderTop: `1px solid ${tokens.colorAmber400}`,
                }}
              >
                <Typography.Text style={{ color: tokens.colorAmber400 }}>
                  {t('hr.messages.purchaseRequestReturned')}
                </Typography.Text>
                {request.approvalRequestId ? (
                  <Button
                    size="small"
                    onClick={() =>
                      router.push(`/approvals/${request.approvalRequestId}`)
                    }
                    style={{ borderRadius: 0 }}
                  >
                    {t('hr.buttons.viewInApprovals')}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>

          <SummaryStrip
            items={[
              {
                label: t('hr.table.items'),
                value: String(request.items.length),
              },
              {
                label: t('hr.form.estimatedTotal'),
                value: formatEtbAmount(request.totalEstimatedEtb),
                emphasize: true,
              },
              {
                label: t('hr.table.requiredBy'),
                value: request.requiredByDate
                  ? formatProjectDate(request.requiredByDate)
                  : '—',
              },
            ]}
          />

          <SectionCard
            title={t('hr.section.requestDetails')}
            bodyClassName="px-3 py-4 sm:px-5"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <MetaItem label={t('hr.form.justification')}>
                <p className="m-0 whitespace-pre-wrap leading-relaxed">
                  {request.justification}
                </p>
              </MetaItem>
              {request.vendorName ? (
                <MetaItem label={t('hr.form.vendor')}>
                  <p className="m-0">{request.vendorName}</p>
                  {request.vendorContact ? (
                    <p
                      className="m-0 text-xs"
                      style={{ color: tokens.colorTextSecondary }}
                    >
                      {request.vendorContact}
                    </p>
                  ) : null}
                </MetaItem>
              ) : null}
              {request.requiredByDate ? (
                <MetaItem label={t('hr.form.requiredByDate')}>
                  {formatProjectDate(request.requiredByDate)}
                </MetaItem>
              ) : null}
              {request.completedAt ? (
                <MetaItem label={t('hr.labels.completedAt')}>
                  {formatProjectDate(request.completedAt)}
                </MetaItem>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard
            title={t('hr.section.items')}
            bodyClassName="px-3 py-4 sm:px-5"
          >
            <DataTable<PurchaseRequestItem>
              rowKey="id"
              className="erp-pro-table"
              size="small"
              columns={itemColumns}
              dataSource={request.items}
              pagination={false}
              locale={{
                emptyText: <Empty description={t('hr.empty.noItems')} />,
              }}
              scroll={false}
              footer={
                request.items.length > 0
                  ? () => (
                      <div className="flex justify-end gap-4 pr-2 text-sm font-medium">
                        <span style={{ color: tokens.colorTextSecondary }}>
                          {t('hr.form.itemCount', {
                            count: request.items.length,
                          })}
                        </span>
                        <span style={{ color: tokens.colorTextPrimary }}>
                          {t('hr.form.estimatedTotal')}:{' '}
                          <strong>
                            {formatEtbAmount(request.totalEstimatedEtb)}
                          </strong>
                        </span>
                      </div>
                    )
                  : undefined
              }
            />
          </SectionCard>

          {(request.documents?.length ?? 0) > 0 ? (
            <SectionCard
              title={t('hr.section.attachments')}
              bodyClassName="px-3 py-4 sm:px-5"
            >
              <AttachmentDownloadList documents={request.documents} />
            </SectionCard>
          ) : null}
        </div>

        <div className="min-w-0">
          {isDirectApproved || tiers.length === 0 ? (
            <SectionCard
              title={t('hr.section.approvalChain')}
              bodyClassName="px-3 py-4 sm:px-4"
            >
              <Typography.Text type="secondary">
                {isDirectApproved
                  ? t('hr.messages.directApprovalNoChain')
                  : t('hr.empty.noApprovalChain')}
              </Typography.Text>
            </SectionCard>
          ) : (
            <ApprovalTierTimeline
              tiers={tiers}
              currentTier={request.approvalRequest?.currentTier ?? 1}
            />
          )}
        </div>
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
                ? t('hr.hints.replaceItemImage', { name: editingItem.image.name })
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
