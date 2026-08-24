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
import DataTable from '@/components/ui/DataTable/DataTable';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
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
  formatPurchaseRequestEmployeeName,
  formatPurchaseRequestStatus,
  PR_GM_THRESHOLD_ETB,
  purchaseRequestStatusVariant,
  requiresGmApproval,
} from '@/lib/utils/purchase-request-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { tokens } from '@/lib/theme/tokens';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

const CURRENCY_OPTIONS: { value: SupportedCurrency; label: string }[] = [
  { value: 'ETB', label: 'ETB' },
  { value: 'USD', label: 'USD' },
  { value: 'CNY', label: 'CNY' },
];

/**
 * Purchase request detail — item editing, cancellation, and approval chain.
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

  const [editingItem, setEditingItem] = useState<PurchaseRequestItem | null>(null);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [itemForm] = Form.useForm<UpdatePurchaseRequestItemPayload & { currency: SupportedCurrency }>();

  const request = detailQuery.data;
  const isOwner =
    Boolean(request) && request?.employeeId === currentUser.data?.id;
  const isDraftOrReturned =
    request?.status === 'DRAFT' || request?.status === 'RETURNED';
  const canEdit = isOwner && isDraftOrReturned;
  const canCancel =
    isOwner &&
    (request?.status === 'DRAFT' || request?.status === 'SUBMITTED');

  const tiers = useMemo(
    () => (request?.approvalRequest?.tiers ?? []) as ApprovalTier[],
    [request?.approvalRequest?.tiers],
  );

  function openEditItem(item: PurchaseRequestItem): void {
    setEditingItem(item);
    itemForm.setFieldsValue({
      itemName: item.itemName,
      description: item.description ?? '',
      quantity: Number(item.quantity),
      unit: item.unit,
      unitPrice: Number(item.unitPrice),
      currency: item.currency,
    });
  }

  async function handleUpdateItem(): Promise<void> {
    if (!editingItem) return;
    try {
      const values = await itemForm.validateFields();
      await updateItemMutation.mutateAsync({
        itemId: editingItem.id,
        payload: {
          itemName: values.itemName,
          description: (values.description as string | undefined) || undefined,
          quantity: Number(values.quantity),
          unit: values.unit,
          unitPrice: Number(values.unitPrice),
          currency: values.currency,
        },
      });
      messageApi.success('Item updated');
      setEditingItem(null);
      itemForm.resetFields();
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to update item', messageApi);
    }
  }

  async function handleDeleteItem(): Promise<void> {
    if (!deleteItemId) return;
    try {
      await deleteItemMutation.mutateAsync(deleteItemId);
      messageApi.success('Item removed');
      setDeleteItemId(null);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to remove item', messageApi);
    }
  }

  async function handleCancel(): Promise<void> {
    try {
      await cancelMutation.mutateAsync();
      messageApi.success('Purchase request cancelled');
      setConfirmCancel(false);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to cancel request', messageApi);
    }
  }

  if (detailQuery.isLoading) {
    return <Skeleton active paragraph={{ rows: 8 }} />;
  }

  if (detailQuery.isError || !request) {
    return (
      <Alert
        type="error"
        showIcon
        message={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : 'Purchase request not found'
        }
        action={
          <Button onClick={() => router.push('/hr/purchase-requests')}>
            {t('hr.buttons.back')}
          </Button>
        }
      />
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
      title: t('hr.table.description'),
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (v: string | null | undefined) => v || '-',
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
      render: (v: number | string) => formatEtbAmount(v),
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
                />
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<Trash2 size={14} />}
                  onClick={() => setDeleteItemId(row.id)}
                />
              </Space>
            ),
          } satisfies ColumnsType<PurchaseRequestItem>[number],
        ]
      : []),
  ];

  return (
    <div className="erp-pro-list-page flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Button
          type="text"
          icon={<ArrowLeft size={16} />}
          onClick={() => router.push('/hr/purchase-requests')}
        >
          {t('hr.buttons.back')}
        </Button>

        {canEdit ? (
          <div className="ml-auto">
            <Button
              type="text"
              icon={<Pencil size={14} />}
              onClick={() => router.push(`/hr/purchase-requests/${requestId}/edit`)}
              style={{ color: tokens.colorPrimary }}
            >
              {t('common.update')}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
        {/* Left column */}
        <div className="flex flex-col gap-4">
          {/* Request header card */}
          <div
            className="rounded-lg overflow-hidden"
            style={{
              background: tokens.colorCardBg,
              border: `1px solid ${tokens.colorBorder}`,
            }}
          >
            <div className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: tokens.colorTextTertiary }}
                >
                  {request.requestNumber}
                </span>
                <span style={{ color: tokens.colorBorder }}>·</span>
                <StatusBadge
                  label={formatPurchaseRequestStatus(request.status, t)}
                  variant={purchaseRequestStatusVariant(request.status)}
                />
                {gmRequired ? (
                  <Tag color="orange">GM Approval Required</Tag>
                ) : (
                  <Tag color="cyan">HR Approval Sufficient</Tag>
                )}
              </div>
              <Typography.Title level={4} style={{ margin: 0 }}>
                {request.title}
              </Typography.Title>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                Submitted by{' '}
                <span className="font-medium" style={{ color: tokens.colorTextPrimary }}>
                  {formatPurchaseRequestEmployeeName(request.employee)}
                </span>
                {request.submittedAt
                  ? ` · ${formatProjectDate(request.submittedAt)}`
                  : null}
              </Typography.Text>
            </div>

            {request.status === 'RETURNED' && isOwner ? (
              <div
                className="px-5 py-3 flex items-center justify-between gap-3"
                style={{
                  background: tokens.colorAmber50,
                  borderTop: `1px solid ${tokens.colorAmber400}`,
                }}
              >
                <Typography.Text style={{ color: tokens.colorAmber400 }}>
                  This request was returned for revision.
                </Typography.Text>
                {request.approvalRequestId ? (
                  <Button
                    size="small"
                    onClick={() =>
                      router.push(`/approvals/${request.approvalRequestId}`)
                    }
                  >
                    {t('hr.buttons.viewInApprovals')}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Summary strip */}
          <SummaryStrip
            items={[
              { label: t('hr.table.items'), value: String(request.items.length) },
              {
                label: t('hr.table.total'),
                value: formatEtbAmount(request.totalEstimatedEtb),
                emphasize: true,
              },
              {
                label: t('hr.table.requiredBy'),
                value: request.requiredByDate
                  ? formatProjectDate(request.requiredByDate)
                  : '-',
              },
              {
                label: t('hr.table.project'),
                value: request.project?.name ?? '-',
              },
            ]}
          />

          {/* Details */}
          <SectionCard title={t('hr.section.requestDetails')} bodyClassName="px-5 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <MetaItem label={t('hr.form.justification')}>
                <p className="whitespace-pre-wrap leading-relaxed m-0">
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
            </div>
          </SectionCard>

          {/* Line Items */}
          <SectionCard title={t('hr.section.items')} bodyClassName="px-5 py-4">
            <DataTable<PurchaseRequestItem>
              rowKey="id"
              className="erp-pro-table"
              size="small"
              columns={itemColumns}
              dataSource={request.items}
              pagination={false}
              locale={{ emptyText: <Empty description={t('hr.empty.noItems')} /> }}
              scroll={false}
              footer={
                request.items.length > 0
                  ? () => (
                      <div className="flex justify-end gap-4 text-sm font-medium pr-2">
                        <span style={{ color: tokens.colorTextSecondary }}>
                          {request.items.length} item
                          {request.items.length !== 1 ? 's' : ''}
                        </span>
                        <span>
                          Total:{' '}
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

          {/* Attachments */}
          {(request.documents?.length ?? 0) > 0 ? (
            <SectionCard title={t('hr.section.attachments')} bodyClassName="px-5 py-4">
              <AttachmentDownloadList documents={request.documents} />
            </SectionCard>
          ) : null}

          {/* Actions */}
          {canCancel ? (
            <div className="flex justify-end gap-2">
              <Button
                danger
                onClick={() => setConfirmCancel(true)}
                loading={cancelMutation.isPending}
              >
                {t('hr.buttons.cancelRequest')}
              </Button>
            </div>
          ) : null}
        </div>

        {/* Right column: approval chain */}
        <div>
          {tiers.length > 0 ? (
            <ApprovalTierTimeline
              tiers={tiers}
              currentTier={request.approvalRequest?.currentTier ?? 1}
            />
          ) : (
            <div
              className="rounded-lg p-4"
              style={{
                background: tokens.colorCardBg,
                border: `1px solid ${tokens.colorBorder}`,
              }}
            >
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                {t('hr.empty.noApprovalChain')}
              </Typography.Text>
            </div>
          )}
        </div>
      </div>

      {/* Item edit modal */}
      <Modal
        open={Boolean(editingItem)}
        title="Edit Line Item"
        onCancel={() => {
          setEditingItem(null);
          itemForm.resetFields();
        }}
        onOk={() => void handleUpdateItem()}
        okText={t('hr.buttons.save')}
        confirmLoading={updateItemMutation.isPending}
        width={560}
        destroyOnClose
      >
        <Form form={itemForm} layout="vertical" style={{ marginTop: 16 }}>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item
              name="itemName"
              label={t('hr.form.itemName')}
              rules={[{ required: true, message: 'Required' }]}
            >
              <Input maxLength={200} />
            </Form.Item>
            <Form.Item name="description" label={t('hr.form.description')}>
              <Input maxLength={500} />
            </Form.Item>
            <Form.Item
              name="quantity"
              label={t('hr.form.quantity')}
              rules={[{ required: true, message: 'Required' }]}
            >
              <InputNumber min={0.001} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="unit"
              label={t('hr.form.unit')}
              rules={[{ required: true, message: 'Required' }]}
            >
              <Input maxLength={50} />
            </Form.Item>
            <Form.Item
              name="unitPrice"
              label={t('hr.form.unitPrice')}
              rules={[{ required: true, message: 'Required' }]}
            >
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="currency"
              label={t('hr.form.currency')}
              rules={[{ required: true }]}
            >
              <Select options={CURRENCY_OPTIONS} />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      {/* Delete item confirm */}
      <ConfirmDialog
        open={Boolean(deleteItemId)}
        title="Remove item"
        description="Are you sure you want to remove this item from the request?"
        confirmLabel="Remove"
        danger
        confirmLoading={deleteItemMutation.isPending}
        onConfirm={() => { void handleDeleteItem(); }}
        onCancel={() => setDeleteItemId(null)}
      />

      {/* Cancel request confirm */}
      <ConfirmDialog
        open={confirmCancel}
        title="Cancel purchase request"
        description="Are you sure you want to cancel this request? This action cannot be undone."
        confirmLabel="{t('hr.buttons.cancelRequest')}"
        danger
        confirmLoading={cancelMutation.isPending}
        onConfirm={() => { void handleCancel(); }}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  );
}
