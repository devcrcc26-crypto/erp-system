'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Empty, Skeleton, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import ExpenseClaimItemModal from '@/components/modules/hr/expense-claim/ExpenseClaimItemModal';
import { SectionCard } from '@/components/modules/hr/shared/hr-page-chrome';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
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
import { useEpcTranslation } from '@/hooks/use-epc-translation';

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

  const claim = detailQuery.data;
  const isOwner = Boolean(claim) && claim?.employeeId === currentUser.data?.id;
  const isDraft = claim?.status === 'DRAFT';
  const canEdit = isOwner && isDraft;
  const canCancel =
    isOwner && (claim?.status === 'DRAFT' || claim?.status === 'SUBMITTED');
  const canSubmit = canEdit && (claim?.items.length ?? 0) > 0;

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
    if (!deleteItemId) return;
    try {
      await deleteItemMutation.mutateAsync(deleteItemId);
      messageApi.success('Item removed');
      setDeleteItemId(null);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to remove item', messageApi);
    }
  }

  async function handleSubmit(): Promise<void> {
    try {
      await submitMutation.mutateAsync();
      messageApi.success('Expense claim submitted for approval');
      setConfirmSubmit(false);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to submit claim', messageApi);
    }
  }

  async function handleCancel(): Promise<void> {
    try {
      await cancelMutation.mutateAsync();
      messageApi.success('Expense claim cancelled');
      setConfirmCancel(false);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to cancel claim', messageApi);
    }
  }

  if (detailQuery.isLoading) {
    return <Skeleton active paragraph={{ rows: 8 }} />;
  }

  if (detailQuery.isError || !claim) {
    return (
      <Alert
        type="error"
        showIcon
        title={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : 'Expense claim not found'
        }
        action={
          <Button onClick={() => router.push('/hr/expense-claims')}>
            Back to list
          </Button>
        }
      />
    );
  }

  const columns: ColumnsType<ExpenseClaimItem> = [
    {
      title: 'Date',
      dataIndex: 'expenseDate',
      key: 'expenseDate',
      width: 110,
      render: (v: string) => formatProjectDate(v),
    },
    { title: 'Category', dataIndex: 'category', key: 'category', width: 140 },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: 'Amount',
      key: 'amount',
      width: 130,
      align: 'right',
      render: (_: unknown, row: ExpenseClaimItem) =>
        formatCurrencyAmount(row.amount, row.currency),
    },
    {
      title: 'ETB Equivalent',
      dataIndex: 'amountEtb',
      key: 'amountEtb',
      width: 140,
      align: 'right',
      render: (v: number) => formatEtbAmount(v),
    },
    {
      title: 'Receipt',
      key: 'receipt',
      width: 100,
      render: (_: unknown, row: ExpenseClaimItem) =>
        row.receipt ? (
          <AttachmentDownloadList documents={[row.receipt]} />
        ) : (
          <span className="text-[var(--color-red-400)] text-xs">Missing</span>
        ),
    },
    ...(canEdit
      ? [
          {
            title: 'Actions',
            key: 'actions',
            width: 90,
            render: (_: unknown, row: ExpenseClaimItem) => (
              <div className="flex items-center gap-1">
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
              </div>
            ),
          } satisfies ColumnsType<ExpenseClaimItem>[number],
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Page header */}
      <div className="mb-2">
        <button
          onClick={() => router.push('/hr/expense-claims')}
          className="flex items-center gap-1.5 text-sm text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] mb-3 transition-colors"
        >
          <ArrowLeft size={14} />
          <span>Expense Claims</span>
        </button>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">
              Expense Claims · {claim.claimNumber}
            </p>
            <h1 className="text-xl font-semibold text-[var(--color-text-primary)] leading-tight">
              {claim.title}
            </h1>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">
              {formatExpenseClaimEmployeeName(claim.employee)}
              {claim.submittedAt
                ? ` · Submitted ${formatProjectDate(claim.submittedAt)}`
                : null}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusBadge
              label={formatExpenseClaimStatus(claim.status, t)}
              variant={expenseClaimStatusVariant(claim.status)}
            />
            {canCancel ? (
              <Button danger size="small" onClick={() => setConfirmCancel(true)}>
                Cancel
              </Button>
            ) : null}
            {canEdit ? (
              <Button
                type="primary"
                size="small"
                disabled={!canSubmit}
                onClick={() => setConfirmSubmit(true)}
              >
                Submit for approval
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
        <div className="flex flex-col gap-4">
          {claim.description ? (
            <SectionCard title="Description" bodyClassName="px-5 py-4">
              <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap m-0">
                {claim.description}
              </p>
            </SectionCard>
          ) : null}

          <SectionCard
            title="Expense Items"
            action={
              canEdit ? (
                <Button type="primary" size="small" onClick={openAddItem}>
                  Add Item
                </Button>
              ) : undefined
            }
          >
            <div className="px-5 py-4">
              <Table<ExpenseClaimItem>
                rowKey="id"
                size="small"
                columns={columns}
                dataSource={claim.items}
                pagination={false}
                locale={{
                  emptyText: (
                    <Empty
                      description={
                        canEdit ? 'Add expense items to this claim' : 'No items'
                      }
                    />
                  ),
                }}
              />
              <div className="flex justify-end items-center gap-2 mt-3 pt-3 border-t border-[rgba(0,0,0,0.06)]">
                <span className="text-sm text-[var(--color-text-secondary)]">
                  Total ({claim.items.length} item{claim.items.length === 1 ? '' : 's'})
                </span>
                <span className="text-base font-bold text-[var(--color-text-primary)]">
                  {formatEtbAmount(claim.totalAmountEtb)}
                </span>
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="flex flex-col gap-4">
          {claim.approvalRequest ? (
            <ApprovalTierTimeline
              tiers={tiers}
              currentTier={claim.approvalRequest.currentTier ?? 0}
            />
          ) : (
            <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)]">
              <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.06)]">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                  Approval Chain
                </h3>
              </div>
              <div className="px-5 py-4">
                <p className="text-sm text-[var(--color-text-tertiary)]">
                  Approval chain appears after submission.
                </p>
              </div>
            </div>
          )}
        </div>
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
        title="Submit expense claim?"
        description="This will start the approval workflow. You will not be able to edit items until the claim is returned."
        confirmLabel="Submit"
        confirmLoading={submitMutation.isPending}
        onConfirm={() => void handleSubmit()}
        onCancel={() => setConfirmSubmit(false)}
      />

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel expense claim?"
        description="This cancels the claim and any linked approval request."
        confirmLabel="Cancel claim"
        danger
        confirmLoading={cancelMutation.isPending}
        onConfirm={() => void handleCancel()}
        onCancel={() => setConfirmCancel(false)}
      />

      <ConfirmDialog
        open={Boolean(deleteItemId)}
        title="Remove item?"
        description="This item and its receipt will be removed and the claim total recalculated."
        confirmLabel="Remove"
        danger
        confirmLoading={deleteItemMutation.isPending}
        onConfirm={() => void handleDeleteItem()}
        onCancel={() => setDeleteItemId(null)}
      />
    </div>
  );
}
