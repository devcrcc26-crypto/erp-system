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
  Skeleton,
  Space,
  Table,
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
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  ConsumablesRequisitionItem,
  UpdateConsumablesRequisitionItemPayload,
} from '@/lib/api/consumables-requisition.types';
import { CONSUMABLES_MAX_ITEMS } from '@/lib/api/consumables-requisition.types';
import {
  useCancelConsumablesRequisition,
  useDeleteConsumablesRequisitionItem,
  useConsumablesRequisition,
  useUpdateConsumablesRequisitionItem,
} from '@/lib/query/consumables-requisition';
import { useCurrentUser } from '@/lib/query/profile';
import {
  formatConsumablesRequisitionEmployeeName,
  formatConsumablesRequisitionStatus,
  consumablesRequisitionStatusVariant,
} from '@/lib/utils/consumables-requisition-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { tokens } from '@/lib/theme/tokens';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Consumables requisition detail — item editing, cancellation, and approval chain.
 */
export default function ConsumablesRequisitionDetailPageContent({
  requisitionId,
}: {
  requisitionId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const currentUser = useCurrentUser();
  const detailQuery = useConsumablesRequisition(requisitionId);
  const cancelMutation = useCancelConsumablesRequisition(requisitionId);
  const deleteItemMutation = useDeleteConsumablesRequisitionItem(requisitionId);
  const updateItemMutation = useUpdateConsumablesRequisitionItem(requisitionId);

  const [editingItem, setEditingItem] =
    useState<ConsumablesRequisitionItem | null>(null);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [itemForm] = Form.useForm<UpdateConsumablesRequisitionItemPayload>();

  const requisition = detailQuery.data;
  const isOwner =
    Boolean(requisition) && requisition?.employeeId === currentUser.data?.id;
  const isDraftOrReturned =
    requisition?.status === 'DRAFT' || requisition?.status === 'RETURNED';
  const canEdit = isOwner && isDraftOrReturned;
  const canCancel =
    isOwner &&
    (requisition?.status === 'DRAFT' || requisition?.status === 'SUBMITTED');
  const isDirectApproved = Boolean(requisition?.directApproved);

  const tiers = useMemo(
    () => (requisition?.approvalRequest?.tiers ?? []) as ApprovalTier[],
    [requisition?.approvalRequest?.tiers],
  );

  function openEditItem(item: ConsumablesRequisitionItem): void {
    setEditingItem(item);
    itemForm.setFieldsValue({
      itemName: item.itemName,
      itemCode: item.itemCode ?? '',
      description: item.description ?? '',
      quantity: Number(item.quantity),
      unit: item.unit,
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
          itemCode: (values.itemCode as string | undefined) || undefined,
          description: (values.description as string | undefined) || undefined,
          quantity: Number(values.quantity),
          unit: values.unit,
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
      messageApi.success('Consumables requisition cancelled');
      setConfirmCancel(false);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to cancel requisition', messageApi);
    }
  }

  if (detailQuery.isLoading) {
    return <Skeleton active paragraph={{ rows: 8 }} />;
  }

  if (detailQuery.isError || !requisition) {
    return (
      <Alert
        type="error"
        showIcon
        message={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : 'Consumables requisition not found'
        }
        action={
          <Button onClick={() => router.push('/hr/consumables')}>
            Back to list
          </Button>
        }
      />
    );
  }

  const itemColumns: ColumnsType<ConsumablesRequisitionItem> = [
    {
      title: t('hr.table.itemName'),
      dataIndex: 'itemName',
      key: 'itemName',
      ellipsis: true,
    },
    {
      title: t('hr.table.itemCode'),
      dataIndex: 'itemCode',
      key: 'itemCode',
      width: 120,
      render: (v: string | null | undefined) => v || '-',
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
      width: 90,
      align: 'right',
    },
    { title: t('hr.table.unit'), dataIndex: 'unit', key: 'unit', width: 80 },
    ...(canEdit
      ? [
          {
            title: '',
            key: 'actions',
            width: 90,
            render: (_: unknown, row: ConsumablesRequisitionItem) => (
              <Space size={4}>
                <Button
                  type="text"
                  size="small"
                  icon={<Pencil size={14} />}
                  onClick={() => openEditItem(row)}
                />
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<Trash2 size={14} />}
                  onClick={() => setDeleteItemId(row.id)}
                />
              </Space>
            ),
          } satisfies ColumnsType<ConsumablesRequisitionItem>[number],
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button
          type="text"
          icon={<ArrowLeft size={16} />}
          onClick={() => router.push('/hr/consumables')}
        >
          Back
        </Button>
        {canCancel ? (
          <Button
            danger
            className="ml-auto"
            onClick={() => setConfirmCancel(true)}
          >
            Cancel Requisition
          </Button>
        ) : null}
        {requisition.status === 'RETURNED' && isOwner ? (
          <Button
            type="primary"
            className={canCancel ? '' : 'ml-auto'}
            onClick={() =>
              router.push(`/approvals/${requisition.approvalRequestId}`)
            }
          >
            Resubmit in Approvals
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
        <div className="flex flex-col gap-4 min-w-0">
          <div
            className="rounded-lg overflow-hidden"
            style={{
              background: tokens.colorCardBg,
              border: `1px solid ${tokens.colorBorder}`,
            }}
          >
            <div className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: tokens.colorTextTertiary }}
                >
                  {requisition.requestNumber}
                </span>
                <span style={{ color: tokens.colorBorder }}>·</span>
                <StatusBadge
                  label={formatConsumablesRequisitionStatus(requisition.status, t)}
                  variant={consumablesRequisitionStatusVariant(
                    requisition.status,
                  )}
                />
                {requisition.declarationConfirmed ? (
                  <Tag color="green">{t('hr.labels.declaration')}</Tag>
                ) : null}
                {isDirectApproved ? (
                  <Tag color="blue">Direct approval</Tag>
                ) : null}
              </div>
              <h2
                className="text-lg font-semibold leading-snug m-0"
                style={{ color: tokens.colorTextPrimary }}
              >
                {requisition.title}
              </h2>
              <p
                className="mt-1 text-sm m-0"
                style={{ color: tokens.colorTextSecondary }}
              >
                {formatConsumablesRequisitionEmployeeName(requisition.employee)}
                {requisition.submittedAt
                  ? ` · Submitted ${formatProjectDate(requisition.submittedAt)}`
                  : null}
              </p>
            </div>
          </div>

          <SummaryStrip
            items={[
              { label: t('hr.table.items'), value: String(requisition.items.length) },
              {
                label: t('hr.table.requiredBy'),
                value: requisition.requiredByDate
                  ? formatProjectDate(requisition.requiredByDate)
                  : '-',
              },
              {
                label: t('hr.table.department'),
                value: requisition.department ?? '-',
              },
            ]}
          />

          {canEdit && requisition.status === 'RETURNED' ? (
            <Alert
              type="warning"
              showIcon
              message="This requisition was returned. Edit items below, then resubmit from Approvals."
            />
          ) : null}

          <SectionCard title={t('hr.form.purpose')} bodyClassName="px-5 py-4">
            <MetaItem label={t('hr.form.purpose')}>
              <p className="whitespace-pre-wrap leading-relaxed m-0">
                {requisition.purpose}
              </p>
            </MetaItem>
          </SectionCard>

          <SectionCard title={t('hr.section.items')} bodyClassName="px-5 py-4">
            {requisition.items.length === 0 ? (
              <Empty description={t('hr.empty.noItems')} />
            ) : (
              <>
                <Table<ConsumablesRequisitionItem>
                  rowKey="id"
                  size="small"
                  columns={itemColumns}
                  dataSource={requisition.items}
                  pagination={false}
                />
                {requisition.items.length >= CONSUMABLES_MAX_ITEMS ? (
                  <Typography.Text type="secondary" className="mt-2 block">
                    Maximum of {CONSUMABLES_MAX_ITEMS} items reached
                  </Typography.Text>
                ) : null}
              </>
            )}
          </SectionCard>
        </div>

        <div className="min-w-0">
          <SectionCard title={t('hr.section.approvalChain')} bodyClassName="px-4 py-4">
            {isDirectApproved ? (
              <Typography.Text type="secondary">
                Approved directly — no approval required
              </Typography.Text>
            ) : tiers.length > 0 ? (
              <ApprovalTierTimeline
                tiers={tiers}
                currentTier={requisition.approvalRequest?.currentTier ?? 1}
              />
            ) : (
              <Typography.Text type="secondary">
                {t('hr.empty.noApprovalChain')}
              </Typography.Text>
            )}
          </SectionCard>
        </div>
      </div>

      <Modal
        title="Edit Item"
        open={Boolean(editingItem)}
        onCancel={() => {
          setEditingItem(null);
          itemForm.resetFields();
        }}
        onOk={() => void handleUpdateItem()}
        confirmLoading={updateItemMutation.isPending}
        destroyOnHidden
      >
        <Form form={itemForm} layout="vertical" className="mt-2">
          <Form.Item
            name="itemName"
            label={t('hr.form.itemName')}
            rules={[{ required: true, message: 'Required' }]}
          >
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="itemCode" label={t('hr.form.itemCode')}>
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="description" label={t('hr.form.description')}>
            <Input maxLength={1000} />
          </Form.Item>
          <Form.Item
            name="quantity"
            label={t('hr.form.quantity')}
            rules={[{ required: true, message: 'Required' }]}
          >
            <InputNumber min={0.01} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="unit"
            label={t('hr.form.unit')}
            rules={[{ required: true, message: 'Required' }]}
          >
            <Input maxLength={50} />
          </Form.Item>
        </Form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteItemId)}
        title="Remove item?"
        description="This line item will be permanently removed."
        confirmLabel="Remove"
        danger
        confirmLoading={deleteItemMutation.isPending}
        onConfirm={() => void handleDeleteItem()}
        onCancel={() => setDeleteItemId(null)}
      />

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel requisition?"
        description="This will cancel the consumables requisition and any open approval request."
        confirmLabel="Cancel Requisition"
        danger
        confirmLoading={cancelMutation.isPending}
        onConfirm={() => void handleCancel()}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  );
}
