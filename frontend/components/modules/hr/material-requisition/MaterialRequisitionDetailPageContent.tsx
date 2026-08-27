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
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  MaterialRequisitionItem,
  UpdateMaterialRequisitionItemPayload,
} from '@/lib/api/material-requisition.types';
import {
  useCancelMaterialRequisition,
  useDeleteMaterialRequisitionItem,
  useMaterialRequisition,
  useUpdateMaterialRequisitionItem,
} from '@/lib/query/material-requisition';
import { useCurrentUser } from '@/lib/query/profile';
import {
  formatMaterialRequisitionEmployeeName,
  formatMaterialRequisitionStatus,
  materialRequisitionStatusVariant,
} from '@/lib/utils/material-requisition-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { tokens } from '@/lib/theme/tokens';

/**
 * Material requisition detail — aligned with Vehicle Refueling / Purchase Request chrome.
 */
export default function MaterialRequisitionDetailPageContent({
  requisitionId,
}: {
  requisitionId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const currentUser = useCurrentUser();
  const detailQuery = useMaterialRequisition(requisitionId);
  const cancelMutation = useCancelMaterialRequisition(requisitionId);
  const deleteItemMutation = useDeleteMaterialRequisitionItem(requisitionId);
  const updateItemMutation = useUpdateMaterialRequisitionItem(requisitionId);

  const [editingItem, setEditingItem] =
    useState<MaterialRequisitionItem | null>(null);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [itemForm] = Form.useForm<UpdateMaterialRequisitionItemPayload>();

  const requisition = detailQuery.data;
  const isOwner =
    Boolean(requisition) && requisition?.employeeId === currentUser.data?.id;
  const isDraftOrReturned =
    requisition?.status === 'DRAFT' || requisition?.status === 'RETURNED';
  const canEdit = isOwner && isDraftOrReturned;
  const canCancel =
    isOwner &&
    (requisition?.status === 'DRAFT' || requisition?.status === 'SUBMITTED');

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

  if (detailQuery.isError || !requisition) {
    return (
      <div className="erp-pro-list-page flex flex-col gap-3">
        <Alert
          type="error"
          showIcon
          title={
            detailQuery.error instanceof ApiRequestError
              ? detailQuery.error.message
              : t('hr.messages.materialRequisitionNotFound')
          }
          action={
            <Button
              onClick={() => router.push('/hr/material-requisition')}
              style={{ borderRadius: 0 }}
            >
              {t('hr.buttons.back')}
            </Button>
          }
        />
      </div>
    );
  }

  const itemColumns: ColumnsType<MaterialRequisitionItem> = [
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
      render: (value: string | null | undefined) => value || '—',
    },
    {
      title: t('hr.table.description'),
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (value: string | null | undefined) => value || '—',
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
            render: (_: unknown, row: MaterialRequisitionItem) => (
              <Space size={4}>
                <Button
                  type="text"
                  size="small"
                  icon={<Pencil size={14} />}
                  onClick={() => openEditItem(row)}
                  style={{ borderRadius: 0 }}
                />
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<Trash2 size={14} />}
                  onClick={() => setDeleteItemId(row.id)}
                  style={{ borderRadius: 0 }}
                />
              </Space>
            ),
          } satisfies ColumnsType<MaterialRequisitionItem>[number],
        ]
      : []),
  ];

  return (
    <div className="erp-pro-list-page flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="text"
          icon={<ArrowLeft size={16} />}
          onClick={() => router.push('/hr/material-requisition')}
          style={{ borderRadius: 0 }}
        >
          {t('hr.buttons.back')}
        </Button>
        <Space wrap size={8} className="ml-auto">
          {canCancel ? (
            <Button
              danger
              onClick={() => setConfirmCancel(true)}
              style={{ borderRadius: 0 }}
            >
              {t('hr.buttons.cancelRequest')}
            </Button>
          ) : null}
          {requisition.status === 'RETURNED' && isOwner ? (
            <Button
              type="primary"
              onClick={() =>
                router.push(`/approvals/${requisition.approvalRequestId}`)
              }
              style={{ borderRadius: 0 }}
            >
              {t('hr.buttons.resubmit')}
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
                  {requisition.requestNumber}
                </span>
                <span style={{ color: tokens.colorBorder }}>·</span>
                <StatusBadge
                  label={formatMaterialRequisitionStatus(requisition.status, t)}
                  variant={materialRequisitionStatusVariant(requisition.status)}
                />
              </div>
              <h2
                className="m-0 text-lg font-semibold leading-snug"
                style={{ color: tokens.colorTextPrimary }}
              >
                {requisition.title}
              </h2>
              <p
                className="m-0 mt-1 text-sm"
                style={{ color: tokens.colorTextSecondary }}
              >
                {formatMaterialRequisitionEmployeeName(requisition.employee)}
                {requisition.submittedAt
                  ? ` · ${formatProjectDate(requisition.submittedAt)}`
                  : null}
              </p>
            </div>

            {requisition.status === 'RETURNED' && isOwner ? (
              <div
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-5"
                style={{
                  background: tokens.colorAmber50,
                  borderTop: `1px solid ${tokens.colorAmber400}`,
                }}
              >
                <Typography.Text style={{ color: tokens.colorAmber400 }}>
                  {t('hr.messages.materialRequisitionReturned')}
                </Typography.Text>
                {requisition.approvalRequestId ? (
                  <Button
                    size="small"
                    onClick={() =>
                      router.push(
                        `/approvals/${requisition.approvalRequestId}`,
                      )
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
                value: String(requisition.items.length),
              },
              {
                label: t('hr.table.requiredBy'),
                value: requisition.requiredByDate
                  ? formatProjectDate(requisition.requiredByDate)
                  : '—',
              },
              {
                label: t('hr.form.warehouseLocation'),
                value: requisition.warehouseLocation ?? '—',
              },
            ]}
          />

          <SectionCard
            title={t('hr.section.requestDetails')}
            bodyClassName="px-3 py-4 sm:px-5"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <MetaItem label={t('hr.labels.purpose')}>
                <p className="m-0 whitespace-pre-wrap leading-relaxed">
                  {requisition.purpose}
                </p>
              </MetaItem>
              {requisition.requiredByDate ? (
                <MetaItem label={t('hr.form.requiredByDate')}>
                  {formatProjectDate(requisition.requiredByDate)}
                </MetaItem>
              ) : null}
              {requisition.warehouseLocation ? (
                <MetaItem label={t('hr.form.warehouseLocation')}>
                  {requisition.warehouseLocation}
                </MetaItem>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard
            title={t('hr.section.items')}
            bodyClassName="px-3 py-4 sm:px-5"
          >
            {requisition.items.length === 0 ? (
              <Empty description={t('hr.empty.noItems')} />
            ) : (
              <DataTable<MaterialRequisitionItem>
                rowKey="id"
                className="erp-pro-table"
                size="small"
                columns={itemColumns}
                dataSource={requisition.items}
                pagination={false}
                scroll={false}
                footer={() => (
                  <div className="flex justify-end pr-2 text-sm font-medium">
                    <span style={{ color: tokens.colorTextSecondary }}>
                      {t('hr.form.itemCount', {
                        count: requisition.items.length,
                      })}
                    </span>
                  </div>
                )}
              />
            )}
          </SectionCard>

          {(requisition.documents?.length ?? 0) > 0 ? (
            <SectionCard
              title={t('hr.section.attachments')}
              bodyClassName="px-3 py-4 sm:px-5"
            >
              <AttachmentDownloadList documents={requisition.documents} />
            </SectionCard>
          ) : null}
        </div>

        <div className="min-w-0">
          {tiers.length === 0 ? (
            <SectionCard
              title={t('hr.section.approvalChain')}
              bodyClassName="px-3 py-4 sm:px-4"
            >
              <Typography.Text type="secondary">
                {t('hr.empty.noApprovalChain')}
              </Typography.Text>
            </SectionCard>
          ) : (
            <ApprovalTierTimeline
              tiers={tiers}
              currentTier={requisition.approvalRequest?.currentTier ?? 1}
            />
          )}
        </div>
      </div>

      <Modal
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
    </div>
  );
}
