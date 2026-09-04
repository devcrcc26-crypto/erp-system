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
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import { ApiRequestError } from '@/lib/api/errors';
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
import { useCurrentUser } from '@/lib/query/profile';
import {
  exitPermitStatusVariant,
  formatExitPermitDepartmentName,
  formatExitPermitDirection,
  formatExitPermitEmployeeName,
  formatExitPermitStatus,
} from '@/lib/utils/exit-permit-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { tokens } from '@/lib/theme/tokens';

const EXIT_PERMIT_LIST_PATH = '/hr/equipment-and-materials-exit-permit';

/**
 * Exit permit detail - items, attachments, cancel, and approval chain.
 */
export default function ExitPermitDetailPageContent({
  permitId,
}: {
  permitId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
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
  const [itemForm] = Form.useForm<UpdateExitPermitItemPayload>();

  const permit = detailQuery.data;
  const isActor =
    Boolean(permit) &&
    (permit?.employeeId === currentUser.data?.id || canViewHr);
  const isDraftOrReturned =
    permit?.status === 'DRAFT' || permit?.status === 'RETURNED';
  const canEdit = Boolean(isActor && isDraftOrReturned);
  const canSubmit =
    Boolean(isActor && isDraftOrReturned) && (permit?.items.length ?? 0) > 0;
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
          issue: (values.issue as string | undefined) || undefined,
          quantity:
            values.quantity !== undefined
              ? Number(values.quantity)
              : undefined,
          unit: (values.unit as string | undefined) || undefined,
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

  if (detailQuery.isError || !permit) {
    return (
      <div className="erp-pro-list-page flex flex-col gap-3">
        <Alert
          type="error"
          showIcon
          title={
            detailQuery.error instanceof ApiRequestError
              ? detailQuery.error.message
              : t('hr.messages.exitPermitNotFound')
          }
          action={
            <Button
              onClick={() => router.push(EXIT_PERMIT_LIST_PATH)}
              style={{ borderRadius: 0 }}
            >
              {t('hr.buttons.back')}
            </Button>
          }
        />
      </div>
    );
  }

  const itemColumns: ColumnsType<ExitPermitItem> = [
    {
      title: t('hr.table.itemName'),
      dataIndex: 'itemName',
      key: 'itemName',
      ellipsis: true,
    },
    {
      title: t('hr.table.issue'),
      dataIndex: 'issue',
      key: 'issue',
      ellipsis: true,
      render: (value: string | null | undefined) => value || '-',
    },
    {
      title: t('hr.table.itemImage'),
      key: 'image',
      width: 120,
      render: (_: unknown, row: ExitPermitItem) =>
        row.image ? (
          <AttachmentDownloadList
            documents={[
              {
                id: row.image.id,
                name: row.image.name,
                fileType: row.image.fileType ?? undefined,
                fileSizeBytes: row.image.fileSizeBytes,
              },
            ]}
          />
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
      width: 90,
      align: 'right',
      render: (value: number | string) => Number(value),
    },
    {
      title: t('hr.table.unit'),
      dataIndex: 'unit',
      key: 'unit',
      width: 80,
      render: (value: string | null | undefined) => value || '-',
    },
    ...(canEdit
      ? [
          {
            title: '',
            key: 'actions',
            width: 90,
            render: (_: unknown, row: ExitPermitItem) => (
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
          } satisfies ColumnsType<ExitPermitItem>[number],
        ]
      : []),
  ];

  return (
    <div className="erp-pro-list-page flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="text"
          icon={<ArrowLeft size={16} />}
          onClick={() => router.push(EXIT_PERMIT_LIST_PATH)}
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
          {canSubmit ? (
            <Button
              type="primary"
              onClick={() => setConfirmSubmit(true)}
              style={{ borderRadius: 0 }}
            >
              {permit.status === 'RETURNED'
                ? t('hr.buttons.resubmit')
                : t('hr.buttons.submitRequest')}
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
                  {permit.requestNumber}
                </span>
                <span style={{ color: tokens.colorBorder }}>·</span>
                <StatusBadge
                  label={formatExitPermitStatus(permit.status, t)}
                  variant={exitPermitStatusVariant(permit.status)}
                />
                {permit.isOnBehalf ? (
                  <Tag color="blue">{t('hr.table.onBehalf')}</Tag>
                ) : null}
              </div>
              <h2
                className="m-0 text-lg font-semibold leading-snug"
                style={{ color: tokens.colorTextPrimary }}
              >
                {formatExitPermitDirection(permit.direction, t)}
              </h2>
              <p
                className="m-0 mt-1 text-sm"
                style={{ color: tokens.colorTextSecondary }}
              >
                {formatExitPermitEmployeeName(permit.employee)}
                {permit.submittedAt
                  ? ` · ${formatProjectDate(permit.submittedAt)}`
                  : null}
              </p>
            </div>

            {permit.status === 'RETURNED' && isActor ? (
              <div
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-5"
                style={{
                  background: tokens.colorAmber50,
                  borderTop: `1px solid ${tokens.colorAmber400}`,
                }}
              >
                <Typography.Text style={{ color: tokens.colorAmber400 }}>
                  {t('hr.messages.exitPermitReturned')}
                </Typography.Text>
                {permit.approvalRequestId ? (
                  <Button
                    size="small"
                    onClick={() =>
                      router.push(`/approvals/${permit.approvalRequestId}`)
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
                value: String(permit.items.length),
              },
              {
                label: t('hr.table.direction'),
                value: formatExitPermitDirection(permit.direction, t),
              },
              {
                label: t('hr.table.date'),
                value: formatProjectDate(permit.date),
              },
            ]}
          />

          <SectionCard
            title={t('hr.section.requestDetails')}
            bodyClassName="px-3 py-4 sm:px-5"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <MetaItem label={t('hr.table.employee')}>
                {formatExitPermitEmployeeName(permit.employee)}
              </MetaItem>
              <MetaItem label={t('hr.table.submittedBy')}>
                {formatExitPermitEmployeeName(
                  permit.submitter ?? permit.creator,
                )}
              </MetaItem>
              <MetaItem label={t('hr.table.department')}>
                {formatExitPermitDepartmentName(permit.department)}
              </MetaItem>
              <MetaItem label={t('hr.table.direction')}>
                <Tag color={permit.direction === 'ENTRANCE' ? 'green' : 'red'}>
                  {formatExitPermitDirection(permit.direction, t)}
                </Tag>
              </MetaItem>
              <MetaItem label={t('hr.table.date')}>
                {formatProjectDate(permit.date)}
              </MetaItem>
              {permit.completedAt ? (
                <MetaItem label={t('hr.labels.completed')}>
                  {formatProjectDate(permit.completedAt)}
                </MetaItem>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard
            title={t('hr.section.items')}
            bodyClassName="px-3 py-4 sm:px-5"
          >
            {permit.items.length === 0 ? (
              <Empty description={t('hr.empty.noItems')} />
            ) : (
              <DataTable<ExitPermitItem>
                rowKey="id"
                className="erp-pro-table"
                size="small"
                columns={itemColumns}
                dataSource={permit.items}
                pagination={false}
                scroll={false}
                footer={() => (
                  <div className="flex justify-end pr-2 text-sm font-medium">
                    <span style={{ color: tokens.colorTextSecondary }}>
                      {t('hr.form.itemCount', {
                        count: permit.items.length,
                      })}
                    </span>
                  </div>
                )}
              />
            )}
          </SectionCard>

          {(permit.documents?.length ?? 0) > 0 ? (
            <SectionCard
              title={t('hr.section.attachments')}
              bodyClassName="px-3 py-4 sm:px-5"
            >
              <AttachmentDownloadList
                documents={(permit.documents ?? []).map((doc) => ({
                  id: doc.id,
                  name: doc.name,
                  fileType: doc.fileType ?? undefined,
                  fileSizeBytes: doc.fileSizeBytes,
                }))}
              />
            </SectionCard>
          ) : null}
        </div>

        <div className="min-w-0">
          {isDirectApproved ? (
            <SectionCard
              title={t('hr.section.approvalChain')}
              bodyClassName="px-3 py-4 sm:px-4"
            >
              <Typography.Text type="secondary">
                {t('hr.messages.directApprovalNoChain')}
              </Typography.Text>
            </SectionCard>
          ) : tiers.length === 0 ? (
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
              currentTier={permit.approvalRequest?.currentTier ?? 1}
            />
          )}
        </div>
      </div>

      <Modal
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
        title={t('hr.dialog.submitExitPermitTitle')}
        description={t('hr.dialog.submitExitPermitDesc')}
        confirmLabel={
          permit.status === 'RETURNED'
            ? t('hr.buttons.resubmit')
            : t('hr.buttons.submitRequest')
        }
        confirmLoading={submitMutation.isPending}
        onConfirm={() => {
          void handleSubmit();
        }}
        onCancel={() => setConfirmSubmit(false)}
      />

      <ConfirmDialog
        open={Boolean(deleteItemId)}
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
