'use client';

import { Alert, Skeleton, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { ApiRequestError } from '@/lib/api/errors';
import type { ExpenseClaimItem } from '@/lib/api/expense-claim.types';
import { useExpenseClaim } from '@/lib/query/expense-claim';
import {
  expenseClaimStatusVariant,
  formatCurrencyAmount,
  formatEtbAmount,
  formatExpenseClaimEmployeeName,
  formatExpenseClaimStatus,
} from '@/lib/utils/expense-claim-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Expense claim body for the Approvals detail inbox.
 */
export default function ExpenseClaimDetail({
  sourceId,
}: {
  approvalRequestId: string;
  sourceId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const detailQuery = useExpenseClaim(sourceId);
  const claim = detailQuery.data;

  if (detailQuery.isLoading && !claim) {
    return (
      <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] p-6">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (detailQuery.isError || !claim) {
    return (
      <Alert
        type="error"
        showIcon
        message={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : 'Expense claim not found'
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
      title: 'ETB',
      dataIndex: 'amountEtb',
      key: 'amountEtb',
      width: 130,
      align: 'right',
      render: (v: number) => formatEtbAmount(v),
    },
    {
      title: 'Receipt',
      key: 'receipt',
      width: 100,
      render: (_: unknown, row: ExpenseClaimItem) =>
        row.receipt ? <AttachmentDownloadList documents={[row.receipt]} /> : '-',
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] overflow-hidden">
        <div className="px-5 py-4">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
              {claim.claimNumber}
            </span>
            <span className="text-[var(--color-border-secondary)]">·</span>
            <StatusBadge
              label={formatExpenseClaimStatus(claim.status, t)}
              variant={expenseClaimStatusVariant(claim.status)}
            />
          </div>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] leading-snug m-0">
            {claim.title}
          </h2>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            Submitted by{' '}
            <span className="font-medium text-[var(--color-text-primary)]">
              {formatExpenseClaimEmployeeName(claim.employee)}
            </span>
            {claim.submittedAt
              ? ` · ${formatProjectDate(claim.submittedAt)}`
              : null}
          </p>
        </div>
      </div>

      <SummaryStrip
        items={[
          { label: 'Items', value: String(claim.items.length) },
          { label: 'Total (ETB)', value: formatEtbAmount(claim.totalAmountEtb), emphasize: true },
        ]}
      />

      {claim.description ? (
        <SectionCard title="Description" bodyClassName="px-5 py-4">
          <MetaItem label="Notes">
            <p className="whitespace-pre-wrap leading-relaxed m-0">
              {claim.description}
            </p>
          </MetaItem>
        </SectionCard>
      ) : null}

      <SectionCard title="Expense Items" bodyClassName="px-5 py-4">
        <Table<ExpenseClaimItem>
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={claim.items}
          pagination={false}
        />
      </SectionCard>
    </div>
  );
}
