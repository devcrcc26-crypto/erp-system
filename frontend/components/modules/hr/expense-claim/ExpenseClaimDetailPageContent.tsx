'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Dropdown,
  Empty,
  Spin,
} from 'antd';
import type { MenuProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ArrowLeft, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import ExpenseClaimItemModal from '@/components/modules/hr/expense-claim/ExpenseClaimItemModal';
import {
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
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

/**
 * Expense claim detail — draft item editing, submission, and approval chain.
 */
export default function ExpenseClaimDetailPageContent({
  claimId,
}: {
  claimId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const canViewHr = useCanViewHr();
  const currentUser = useCurrentUser();
  const detailQuery = useExpenseClaim(claimId);
  const submitMutation = useSubmitExpenseClaim(claimId);
  const cancelMutation = useCancelExpenseClaim(claimId);
  const deleteItemMutation = useDeleteExpenseClaimItem(claimId);

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ExpenseClaimItem | null>(null);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useSetHeaderExtra(null);

  const claim = detailQuery.data;
  const isOwner = Boolean(claim) && claim?.employeeId === currentUser.data?.id;
  const isDraft = claim?.status === 'DRAFT';
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

  const columns: ColumnsType<ExpenseClaimItem> = useMemo(
    () => [
      {
        title: t('hr.table.date'),
        dataIndex: 'expenseDate',
        key: 'expenseDate',
        width: 110,
        render: (v: string) => formatProjectDate(v),
      },
      {
        title: t('hr.table.category'),
        dataIndex: 'category',
        key: 'category',
        width: 140,
      },
      {
        title: t('hr.table.description'),
        dataIndex: 'description',
        key: 'description',
        ellipsis: true,
      },
      {
        title: t('hr.table.amount'),
        key: 'amount',
        width: 130,
        align: 'right',
        render: (_: unknown, row: ExpenseClaimItem) =>
          formatCurrencyAmount(row.amount, row.currency),
      },
      {
        title: t('hr.table.etbEquivalent'),
        dataIndex: 'amountEtb',
        key: 'amountEtb',
        width: 140,
        align: 'right',
        render: (v: number | string) => formatEtbAmount(v),
      },
      {
        title: t('hr.table.receipt'),
        key: 'receipt',
        width: 100,
        render: (_: unknown, row: ExpenseClaimItem) =>
          row.receipt ? (
            <AttachmentDownloadList documents={[row.receipt]} />
          ) : (
            <span className="text-xs text-[var(--color-red-400)]">
              {t('hr.labels.receiptMissing')}
            </span>
          ),
      },
      ...(canEdit
        ? [
            {
              title: t('hr.table.actions'),
              key: 'actions',
              width: 140,
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
                    icon: <Trash2 size={14} />,
                    danger: true,
                    onClick: () => setDeleteItemId(row.id),
                  },
                ];
                return (
                  <Dropdown menu={{ items }} trigger={['click']}>
                    <Button
                      type="text"
                      size="small"
                      icon={<MoreHorizontal size={16} />}
                      onClick={(event) => event.stopPropagation()}
                      style={{ borderRadius: 0 }}
                    />
                  </Dropdown>
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
      <div className="flex justify-center p-12">
        <Spin />
      </div>
    );
  }

  if (detailQuery.isError || !claim) {
    return (
      <Alert
        type="error"
        showIcon
        title={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : t('hr.messages.expenseClaimNotFound')
        }
        action={
          <Button
            onClick={() => router.push('/hr/expense-claims')}
            style={{ borderRadius: 0 }}
          >
            {t('hr.buttons.backToList')}
          </Button>
        }
      />
    );
  }

  if (
    !canViewHr &&
    currentUser.data?.id &&
    claim.employeeId !== currentUser.data.id
  ) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <Spin />
      </div>
    );
  }

  const backHref = canViewHr ? '/hr/expense-claims' : '/approvals';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="text"
          icon={<ArrowLeft size={16} />}
          onClick={() => router.push(backHref)}
          style={{ borderRadius: 0 }}
        >
          {t('hr.buttons.backToList')}
        </Button>
      </div>

      <div className="overflow-hidden rounded-none border border-[rgba(0,0,0,0.08)] bg-white">
        <div className="px-3 py-4 sm:px-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                {claim.claimNumber}
              </span>
              <StatusBadge
                label={formatExpenseClaimStatus(claim.status, t)}
                variant={expenseClaimStatusVariant(claim.status)}
              />
            </div>
            <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
              {canCancel ? (
                <Button
                  danger
                  size="small"
                  onClick={() => setConfirmCancel(true)}
                  style={{ borderRadius: 0 }}
                >
                  {t('hr.buttons.cancel')}
                </Button>
              ) : null}
              {canEdit ? (
                <Button
                  type="primary"
                  size="small"
                  disabled={!canSubmit}
                  onClick={() => setConfirmSubmit(true)}
                  style={{ borderRadius: 0 }}
                >
                  {t('hr.buttons.submitClaim')}
                </Button>
              ) : null}
            </div>
          </div>

          <h1 className="m-0 text-lg font-semibold leading-snug text-[var(--color-text-primary)]">
            {claim.title}
          </h1>

          <p className="mb-0 mt-2 text-sm text-[var(--color-text-secondary)]">
            <span className="font-medium text-[var(--color-text-primary)]">
              {formatExpenseClaimEmployeeName(claim.employee)}
            </span>
            {claim.submittedAt
              ? ` · ${t('hr.labels.submittedOn', {
                  date: formatProjectDate(claim.submittedAt),
                })}`
              : null}
          </p>
        </div>
      </div>

      <SummaryStrip
        items={[
          {
            label: t('hr.table.items'),
            value: String(claim.items.length),
          },
          {
            label: t('hr.table.total'),
            value: formatEtbAmount(claim.totalAmountEtb),
            emphasize: true,
          },
          {
            label: t('hr.table.createdDate'),
            value: formatProjectDate(claim.createdAt),
          },
        ]}
      />

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-4">
          {claim.description ? (
            <SectionCard
              title={t('hr.form.description')}
              bodyClassName="px-3 py-4 sm:px-5"
            >
              <p className="m-0 whitespace-pre-wrap text-sm text-[var(--color-text-primary)]">
                {claim.description}
              </p>
            </SectionCard>
          ) : null}

          <SectionCard
            title={t('hr.section.items')}
            bodyClassName="p-0"
            action={
              canEdit ? (
                <Button
                  type="primary"
                  size="small"
                  icon={<Plus size={16} />}
                  onClick={openAddItem}
                  style={{ borderRadius: 0 }}
                >
                  {t('hr.buttons.addItem')}
                </Button>
              ) : undefined
            }
          >
            <DataTable<ExpenseClaimItem>
              rowKey="id"
              className="erp-pro-table"
              size="small"
              columns={columns}
              dataSource={claim.items}
              pagination={false}
              scroll={{ x: 960 }}
              locale={{
                emptyText: <Empty description={t('hr.empty.noItems')} />,
              }}
            />
          </SectionCard>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
          {claim.approvalRequest ? (
            <ApprovalTierTimeline
              tiers={tiers}
              currentTier={claim.approvalRequest.currentTier ?? 0}
            />
          ) : (
            <SectionCard
              title={t('hr.section.approvalChain')}
              bodyClassName="px-3 py-4 sm:px-5"
            >
              <p className="m-0 text-sm text-[var(--color-text-tertiary)]">
                {t('hr.empty.noApprovalChain')}
              </p>
            </SectionCard>
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
