'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Dropdown,
  Empty,
  Grid,
  Skeleton,
  Space,
} from 'antd';
import type { MenuProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DeleteOutlined,
  MoreOutlined,
  PlusOutlined,
  SendOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { ArrowLeft, Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import ExpenseClaimItemModal from '@/components/modules/hr/expense-claim/ExpenseClaimItemModal';
import { MetaItem } from '@/components/modules/hr/shared/hr-page-chrome';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DataTable from '@/components/ui/DataTable/DataTable';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import { ApiRequestError } from '@/lib/api/errors';
import type { ExpenseClaimItem } from '@/lib/api/expense-claim.types';
import {
  useCancelExpenseClaim,
  useDeleteExpenseClaim,
  useDeleteExpenseClaimItem,
  useExpenseClaim,
  useSubmitExpenseClaim,
} from '@/lib/query/expense-claim';
import { useCurrentUser } from '@/lib/query/profile';
import {
  expenseClaimStatusVariant,
  formatCurrencyAmount,
  formatEtbAmount,
  formatExpenseClaimEmployeeName,
  formatExpenseClaimStatus,
} from '@/lib/utils/expense-claim-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';

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
 * Expense claim detail — Users / employee profile chrome.
 */
export default function ExpenseClaimDetailPageContent({
  claimId,
}: {
  claimId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isNarrow = screens.sm === false;
  const canViewHr = useCanViewHr();
  const currentUser = useCurrentUser();
  const detailQuery = useExpenseClaim(claimId);
  const submitMutation = useSubmitExpenseClaim(claimId);
  const cancelMutation = useCancelExpenseClaim(claimId);
  const deleteClaimMutation = useDeleteExpenseClaim();
  const deleteItemMutation = useDeleteExpenseClaimItem(claimId);

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ExpenseClaimItem | null>(null);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDeleteClaim, setConfirmDeleteClaim] = useState(false);

  useSetHeaderExtra(null);

  const claim = detailQuery.data;
  const isOwner = Boolean(claim) && claim?.employeeId === currentUser.data?.id;
  const isDraft = claim?.status === 'DRAFT';
  const canManage = canViewHr;
  const canEditHeader =
    Boolean(claim) &&
    (claim?.status === 'DRAFT' || claim?.status === 'RETURNED') &&
    (canManage || isOwner);
  const canEdit = isOwner && isDraft;
  const canCancel =
    isOwner && (claim?.status === 'DRAFT' || claim?.status === 'SUBMITTED');
  const canSubmit = canEdit && (claim?.items.length ?? 0) > 0;

  useEffect(() => {
    if (canViewHr || detailQuery.isLoading) {
      return;
    }

    if (
      detailQuery.isError &&
      detailQuery.error instanceof ApiRequestError &&
      (detailQuery.error.status === 403 || detailQuery.error.status === 404)
    ) {
      router.replace('/approvals');
      return;
    }

    if (
      claim &&
      currentUser.data?.id &&
      claim.employeeId !== currentUser.data.id
    ) {
      router.replace('/approvals');
    }
  }, [
    canViewHr,
    claim,
    currentUser.data?.id,
    detailQuery.error,
    detailQuery.isError,
    detailQuery.isLoading,
    router,
  ]);

  const tiers = useMemo(
    () => (claim?.approvalRequest?.tiers ?? []) as ApprovalTier[],
    [claim?.approvalRequest?.tiers],
  );

  function openAddItem(): void {
    setEditingItem(null);
    setItemModalOpen(true);
  }

  function openEditItem(item: ExpenseClaimItem): void {
    setEditingItem(item);
    setItemModalOpen(true);
  }

  async function handleDeleteItem(): Promise<void> {
    if (!deleteItemId) {
      return;
    }
    try {
      await deleteItemMutation.mutateAsync(deleteItemId);
      messageApi.success(t('hr.messages.expenseClaimItemDeleted'));
      setDeleteItemId(null);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToDeleteExpenseClaimItem'),
        messageApi,
      );
    }
  }

  async function handleSubmit(): Promise<void> {
    try {
      await submitMutation.mutateAsync();
      messageApi.success(t('hr.messages.expenseClaimSubmitted'));
      setConfirmSubmit(false);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToSubmitExpenseClaim'),
        messageApi,
      );
    }
  }

  async function handleCancel(): Promise<void> {
    try {
      await cancelMutation.mutateAsync();
      messageApi.success(t('hr.messages.expenseClaimCancelled'));
      setConfirmCancel(false);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToCancelExpenseClaim'),
        messageApi,
      );
    }
  }

  async function handleDeleteClaim(): Promise<void> {
    try {
      await deleteClaimMutation.mutateAsync(claimId);
      messageApi.success(t('hr.messages.expenseClaimDeleted'));
      setConfirmDeleteClaim(false);
      router.push('/hr/expense-claims');
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToDeleteExpenseClaim'),
        messageApi,
      );
    }
  }

  const columns: ColumnsType<ExpenseClaimItem> = useMemo(
    () => [
      {
        title: t('hr.table.date'),
        dataIndex: 'expenseDate',
        key: 'expenseDate',
        width: 110,
        render: (v: string) => (
          <span className="erp-users-cell-strong">{formatProjectDate(v)}</span>
        ),
      },
      {
        title: t('hr.table.category'),
        dataIndex: 'category',
        key: 'category',
        width: 140,
        render: (value: string) => (
          <span className="erp-users-cell-sub">{value}</span>
        ),
      },
      {
        title: t('hr.table.description'),
        dataIndex: 'description',
        key: 'description',
        ellipsis: true,
        render: (value: string) => (
          <span className="erp-users-cell-strong">{value}</span>
        ),
      },
      {
        title: t('hr.table.amount'),
        key: 'amount',
        width: 130,
        align: 'right',
        render: (_: unknown, row: ExpenseClaimItem) => (
          <span className="erp-users-cell-sub tabular-nums">
            {formatCurrencyAmount(row.amount, row.currency)}
          </span>
        ),
      },
      {
        title: t('hr.table.etbEquivalent'),
        dataIndex: 'amountEtb',
        key: 'amountEtb',
        width: 140,
        align: 'right',
        render: (v: number | string) => (
          <span className="erp-users-cell-strong tabular-nums">
            {formatEtbAmount(v)}
          </span>
        ),
      },
      {
        title: t('hr.table.receipt'),
        key: 'receipt',
        width: 120,
        render: (_: unknown, row: ExpenseClaimItem) =>
          row.receipt ? (
            <AttachmentDownloadList documents={[row.receipt]} />
          ) : (
            <span className="text-xs text-[#D32F2F]">
              {t('hr.labels.receiptMissing')}
            </span>
          ),
      },
      ...(canEdit
        ? [
            {
              title: '',
              key: 'actions',
              width: 56,
              fixed: 'right' as const,
              render: (_: unknown, row: ExpenseClaimItem) => {
                const items: MenuProps['items'] = [
                  {
                    key: 'edit',
                    label: t('common.update'),
                    icon: <Pencil size={14} />,
                    onClick: () => openEditItem(row),
                  },
                  {
                    key: 'delete',
                    label: t('common.delete'),
                    icon: <DeleteOutlined />,
                    danger: true,
                    onClick: () => setDeleteItemId(row.id),
                  },
                ];
                return (
                  <div
                    className="erp-table-row-actions flex items-center justify-end"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <Dropdown menu={{ items }} trigger={['click']}>
                      <Button
                        type="text"
                        size="small"
                        icon={<MoreOutlined />}
                        aria-label={t('common.actions')}
                      />
                    </Dropdown>
                  </div>
                );
              },
            } satisfies ColumnsType<ExpenseClaimItem>[number],
          ]
        : []),
    ],
    [canEdit, t],
  );

  if (detailQuery.isLoading) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-detail-page erp-expense-claim-detail-page">
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 6 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !claim) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-detail-page">
        <Alert
          type="error"
          showIcon
          title={
            detailQuery.error instanceof ApiRequestError
              ? detailQuery.error.message
              : t('hr.messages.expenseClaimNotFound')
          }
          action={
            <Button onClick={() => router.push('/hr/expense-claims')}>
              {t('hr.buttons.backToList')}
            </Button>
          }
        />
      </div>
    );
  }

  if (
    !canViewHr &&
    currentUser.data?.id &&
    claim.employeeId !== currentUser.data.id
  ) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-detail-page">
        <div className="flex min-h-[240px] items-center justify-center">
          <Skeleton active paragraph={{ rows: 4 }} />
        </div>
      </div>
    );
  }

  const backHref = canViewHr ? '/hr/expense-claims' : '/approvals';
  const employeeName = formatExpenseClaimEmployeeName(claim.employee);

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-detail-page erp-expense-claim-detail-page">
      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-employee-toolbar">
          <div className="erp-employee-toolbar-back flex min-w-0 items-center gap-2">
            <Button
              type="text"
              icon={<ArrowLeft size={16} />}
              onClick={() => router.push(backHref)}
              aria-label={t('hr.buttons.backToList')}
            >
              {isNarrow ? undefined : t('hr.buttons.back')}
            </Button>
          </div>
          <div className="erp-employee-toolbar-actions flex flex-wrap items-center justify-end gap-2">
            {claim.approvalRequestId ? (
              <Button
                onClick={() =>
                  router.push(`/approvals/${claim.approvalRequestId}`)
                }
              >
                {t('hr.buttons.viewInApprovals')}
              </Button>
            ) : null}
            {canEditHeader ? (
              <Button
                icon={<Pencil size={14} />}
                onClick={() =>
                  router.push(`/hr/expense-claims/${claimId}/edit`)
                }
                aria-label={t('common.update')}
              >
                {isNarrow ? undefined : t('common.update')}
              </Button>
            ) : null}
            {canCancel ? (
              <Button
                danger
                icon={<StopOutlined />}
                onClick={() => setConfirmCancel(true)}
                aria-label={t('hr.buttons.cancel')}
              >
                {isNarrow ? undefined : t('hr.buttons.cancel')}
              </Button>
            ) : null}
            {(canEdit || canManage) ? (
              <Space.Compact>
                {canEdit ? (
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    disabled={!canSubmit}
                    onClick={() => setConfirmSubmit(true)}
                    aria-label={t('hr.buttons.submitClaim')}
                  >
                    {isNarrow ? undefined : t('hr.buttons.submitClaim')}
                  </Button>
                ) : null}
                {canManage ? (
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => setConfirmDeleteClaim(true)}
                    aria-label={t('common.delete')}
                  >
                    {isNarrow ? undefined : t('common.delete')}
                  </Button>
                ) : null}
              </Space.Compact>
            ) : null}
          </div>
        </div>

        <div className="erp-employee-hero erp-contract-hero">
          <div className="erp-employee-hero-copy min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span className="erp-users-id-chip">{claim.claimNumber}</span>
              <StatusBadge
                label={formatExpenseClaimStatus(claim.status, t)}
                variant={expenseClaimStatusVariant(claim.status)}
              />
            </div>
            <div className="flex min-w-0 flex-wrap items-baseline justify-center gap-2 sm:justify-start">
              <h2 className="erp-users-name erp-employee-hero-name m-0">
                {claim.title}
              </h2>
            </div>
            <p className="erp-users-email m-0 mt-1.5">{employeeName}</p>
            {claim.submittedAt ? (
              <p className="erp-users-cell-sub m-0 mt-1">
                {t('hr.labels.submittedOn', {
                  date: formatProjectDate(claim.submittedAt),
                })}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="erp-users-stat-bar erp-employee-meta-bar erp-contract-meta-bar">
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.table.items')}</p>
            <p className="erp-employee-meta-value">{claim.items.length}</p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.table.total')}</p>
            <p className="erp-employee-meta-value">
              {formatEtbAmount(claim.totalAmountEtb)}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.table.createdDate')}</p>
            <p className="erp-employee-meta-value">
              {formatProjectDate(claim.createdAt)}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('common.status')}</p>
            <p className="erp-employee-meta-value">
              {formatExpenseClaimStatus(claim.status, t)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_300px]">
        <div className="erp-pro-card min-w-0">
          <div className="erp-employee-tab-panel erp-contract-detail-body">
            {claim.description ? (
              <DetailSection title={t('hr.form.description')}>
                <p className="m-0 whitespace-pre-wrap text-sm text-[var(--color-text-primary)]">
                  {claim.description}
                </p>
              </DetailSection>
            ) : null}

            <DetailSection
              title={t('hr.section.items')}
              bodyClassName="!p-0"
              action={
                canEdit ? (
                  <Button
                    type="primary"
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={openAddItem}
                  >
                    {t('hr.buttons.addItem')}
                  </Button>
                ) : undefined
              }
            >
              <DataTable<ExpenseClaimItem>
                rowKey="id"
                className="erp-pro-table erp-users-table"
                size="small"
                columns={columns}
                dataSource={claim.items}
                pagination={false}
                scroll={{ x: 960 }}
                locale={{
                  emptyText: <Empty description={t('hr.empty.noItems')} />,
                }}
              />
            </DetailSection>

            <DetailSection title={t('hr.section.requestDetails')}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <MetaItem label={t('hr.labels.employee')}>
                  {employeeName}
                </MetaItem>
                <MetaItem label={t('hr.table.claimNumber')}>
                  <span className="erp-users-id-chip">{claim.claimNumber}</span>
                </MetaItem>
                <MetaItem label={t('hr.table.status')}>
                  <StatusBadge
                    label={formatExpenseClaimStatus(claim.status, t)}
                    variant={expenseClaimStatusVariant(claim.status)}
                  />
                </MetaItem>
                <MetaItem label={t('hr.table.total')}>
                  {formatEtbAmount(claim.totalAmountEtb)}
                </MetaItem>
              </div>
            </DetailSection>
          </div>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
          {claim.approvalRequest ? (
            <ApprovalTierTimeline
              tiers={tiers}
              currentTier={claim.approvalRequest.currentTier ?? 0}
            />
          ) : (
            <div className="erp-pro-card">
              <DetailSection title={t('hr.section.approvalChain')}>
                <p className="erp-users-cell-sub m-0">
                  {t('hr.empty.noApprovalChain')}
                </p>
              </DetailSection>
            </div>
          )}
        </aside>
      </div>

      <ExpenseClaimItemModal
        open={itemModalOpen}
        claimId={claimId}
        editingItem={editingItem}
        onClose={() => {
          setItemModalOpen(false);
          setEditingItem(null);
        }}
      />

      <ConfirmDialog
        open={confirmSubmit}
        title={t('hr.dialog.submitExpenseClaimTitle')}
        description={t('hr.dialog.submitExpenseClaimDesc')}
        confirmLabel={t('hr.buttons.submitClaim')}
        confirmLoading={submitMutation.isPending}
        onConfirm={() => void handleSubmit()}
        onCancel={() => setConfirmSubmit(false)}
      />

      <ConfirmDialog
        open={confirmCancel}
        title={t('hr.dialog.cancelExpenseClaimTitle')}
        description={t('hr.dialog.cancelExpenseClaimDesc')}
        confirmLabel={t('hr.buttons.cancelClaim')}
        danger
        confirmLoading={cancelMutation.isPending}
        onConfirm={() => void handleCancel()}
        onCancel={() => setConfirmCancel(false)}
      />

      <ConfirmDialog
        open={confirmDeleteClaim}
        title={t('hr.empty.deleteExpenseClaimTitle')}
        description={t('hr.empty.deleteExpenseClaimDescription')}
        confirmLabel={t('common.delete')}
        danger
        confirmLoading={deleteClaimMutation.isPending}
        onConfirm={() => void handleDeleteClaim()}
        onCancel={() => setConfirmDeleteClaim(false)}
      />

      <ConfirmDialog
        open={Boolean(deleteItemId)}
        title={t('hr.dialog.deleteExpenseClaimItemTitle')}
        description={t('hr.dialog.deleteExpenseClaimItemDesc')}
        confirmLabel={t('common.delete')}
        danger
        confirmLoading={deleteItemMutation.isPending}
        onConfirm={() => void handleDeleteItem()}
        onCancel={() => setDeleteItemId(null)}
      />
    </div>
  );
}
