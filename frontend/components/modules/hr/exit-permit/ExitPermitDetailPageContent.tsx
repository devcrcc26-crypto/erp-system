'use client';

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
import { ArrowLeft, Inbox, Pencil, Trash2 } from 'lucide-react';
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
import ExportPdfButton from '@/components/modules/hr/import-export/ExportPdfButton';
import { useHrPdfContext } from '@/hooks/use-hr-pdf-context';
import { exportExitPermitPdf } from '@/lib/utils/exit-permit-export';
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
 * Exit permit detail — Users / employee profile chrome.
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
  const pdfContext = useHrPdfContext();
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

  useSetHeaderExtra(null);

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
        width: 56,
        render: (_: unknown, row: ExitPermitItem) => (
          <DocumentImageThumb
            documentId={row.documentId ?? row.image?.id}
            alt={row.itemName}
            fileName={row.image?.name}
            fileType={row.image?.fileType}
            size={40}
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
              <p className="erp-users-cell-sub m-0 mt-0.5 truncate">
                {row.issue}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        title: t('hr.table.quantity'),
        dataIndex: 'quantity',
        key: 'quantity',
        width: 72,
        align: 'right',
        render: (value: number | string) => (
          <span className="erp-users-cell-sub tabular-nums">
            {Number(value)}
          </span>
        ),
      },
      {
        title: t('hr.table.unit'),
        dataIndex: 'unit',
        key: 'unit',
        width: 72,
        responsive: ['sm'],
        render: (value: string | null | undefined) => (
          <span className="erp-users-cell-sub">{value || '—'}</span>
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
      <div className="erp-pro-list-page erp-users-page erp-employee-detail-page erp-exit-permit-detail-page">
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !permit) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-detail-page">
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
  const submitLabel =
    permit.status === 'RETURNED'
      ? t('hr.buttons.resubmit')
      : t('hr.buttons.submitRequest');

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

  /** Renders this record with the shared HR document layout. */
  function handleExportPdf(): void {
    if (!permit) {
      return;
    }

      exportExitPermitPdf({
        permit,
        companyName: pdfContext.companyName,
        preparedBy: pdfContext.preparedBy,
      });
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-detail-page erp-exit-permit-detail-page">
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
            <ExportPdfButton
              compact={isNarrow}
              buildPdf={() => handleExportPdf()}
            />
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
                <Tag color="blue">{t('hr.table.onBehalf')}</Tag>
              ) : null}
            </div>
            <div className="flex min-w-0 flex-wrap items-baseline justify-center gap-2 sm:justify-start">
              <h2 className="erp-users-name erp-employee-hero-name m-0 break-words">
                {formatExitPermitDirection(permit.direction, t)}
              </h2>
            </div>
            <p className="erp-users-email m-0 mt-1.5 break-words sm:text-left">
              {employeeName}
              {permit.submittedAt
                ? ` · ${formatProjectDate(permit.submittedAt)}`
                : null}
            </p>
          </div>
        </div>
      </div>

      <div className="erp-users-stat-bar erp-employee-meta-bar erp-contract-meta-bar">
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.table.items')}</p>
            <p className="erp-employee-meta-value">{permit.items.length}</p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.table.direction')}</p>
            <p className="erp-employee-meta-value">
              {formatExitPermitDirection(permit.direction, t)}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.table.date')}</p>
            <p className="erp-employee-meta-value">
              {formatProjectDate(permit.date)}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.table.department')}</p>
            <p className="erp-employee-meta-value truncate">
              {formatExitPermitDepartmentName(permit.department)}
            </p>
          </div>
        </div>
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

      <div className="grid grid-cols-1 items-start gap-3 sm:gap-4 lg:grid-cols-[1fr_300px]">
        <div className="erp-pro-card min-w-0 overflow-hidden">
          <div className="erp-employee-tab-panel erp-contract-detail-body">
            <DetailSection title={t('hr.section.requestDetails')}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <MetaItem label={t('hr.table.employee')}>
                  {employeeName}
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
                  <Tag
                    color={permit.direction === 'ENTRANCE' ? 'green' : 'red'}
                    className="rounded-xl"
                  >
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
            </DetailSection>

            <DetailSection title={t('hr.section.items')} bodyClassName="!p-0">
              <DocumentPreviewGroup
                documents={exitPermitItemImages(permit.items)}
              >
                <DataTable<ExitPermitItem>
                  rowKey="id"
                  className="erp-pro-table erp-users-table"
                  size="small"
                  columns={itemColumns}
                  dataSource={permit.items}
                  pagination={false}
                  scroll={canEdit ? { x: 'max-content' } : false}
                  locale={{
                    emptyText: (
                      <TableEmptyState
                        icon={<Inbox size={28} strokeWidth={1.5} />}
                        title={t('hr.empty.noItems')}
                        description={t(
                          'pages.hr.exitPermit.itemsStepDescription',
                        )}
                      />
                    ),
                  }}
                  footer={
                    permit.items.length > 0
                      ? () => (
                          <div className="flex justify-end px-3 py-2 text-sm">
                            <span className="erp-users-cell-sub">
                              {t('hr.form.itemCount', {
                                count: permit.items.length,
                              })}
                            </span>
                          </div>
                        )
                      : undefined
                  }
                />
              </DocumentPreviewGroup>
            </DetailSection>

            {(permit.documents?.length ?? 0) > 0 ? (
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
            ) : null}
          </div>
        </div>

        <aside className="min-w-0 lg:sticky lg:top-4">
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
