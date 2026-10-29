'use client';

import { Alert, Skeleton } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import { DocumentPreviewGroup } from '@/components/shared/preview';
import DataTable from '@/components/ui/DataTable/DataTable';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import { ApiRequestError } from '@/lib/api/errors';
import type { ExpenseClaimItem } from '@/lib/api/expense-claim.types';
import { useExpenseClaim } from '@/lib/query/expense-claim';
import {
  formatCurrencyAmount,
  formatEtbAmount,
  itemReceiptDocuments,
} from '@/lib/utils/expense-claim-display';
import { formatProjectDate } from '@/lib/utils/project-display';

/**
 * Expense claim body for the Approvals detail inbox.
 * Header is rendered by ApprovalDetailPageContent - do not duplicate it here.
 */
export default function ExpenseClaimDetail({
  sourceId,
}: {
  approvalRequestId: string;
  sourceId: string;
}): React.ReactNode {
  const detailQuery = useExpenseClaim(sourceId);
  const claim = detailQuery.data;

  if (detailQuery.isLoading && !claim) {
    return (
      <div className="bg-white rounded-none border border-[rgba(0,0,0,0.08)] p-6">
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
      responsive: ['sm'],
      render: (v: string) => formatProjectDate(v),
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      width: 140,
      responsive: ['md'],
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      width: 260,
      ellipsis: true,
      render: (value: string, row: ExpenseClaimItem) => (
        <div className="min-w-0 max-w-[260px]">
          <span className="block truncate" title={value || undefined}>
            {value || '-'}
          </span>
          <p className="erp-users-cell-sub m-0 mt-0.5 sm:hidden">
            {formatProjectDate(row.expenseDate)}
          </p>
          <p className="erp-users-cell-sub m-0 mt-0.5 md:hidden">
            {row.category}
          </p>
          <p className="erp-users-cell-sub m-0 mt-0.5 tabular-nums lg:hidden">
            {formatCurrencyAmount(row.amount, row.currency)}
          </p>
        </div>
      ),
    },
    {
      title: 'Amount',
      key: 'amount',
      width: 130,
      align: 'right',
      responsive: ['lg'],
      render: (_: unknown, row: ExpenseClaimItem) => (
        <span className="tabular-nums whitespace-nowrap">
          {formatCurrencyAmount(row.amount, row.currency)}
        </span>
      ),
    },
    {
      title: 'ETB',
      dataIndex: 'amountEtb',
      key: 'amountEtb',
      width: 130,
      align: 'right',
      render: (v: number) => (
        <span className="tabular-nums whitespace-nowrap">
          {formatEtbAmount(v)}
        </span>
      ),
    },
    {
      title: 'Receipt',
      key: 'receipt',
      width: 96,
      render: (_: unknown, row: ExpenseClaimItem) => {
        // One row per item; every receipt of the item is listed here.
        const receipts = itemReceiptDocuments(row);
        return receipts.length > 0 ? (
          <AttachmentDownloadList documents={receipts} compact />
        ) : (
          '-'
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <SummaryStrip
        items={[
          { label: 'Items', value: String(claim.items.length) },
          { label: 'Total (ETB)', value: formatEtbAmount(claim.totalAmountEtb), emphasize: true },
          ...(claim.paidAt
            ? [
                {
                  label: 'Paid on',
                  value: formatProjectDate(claim.paidAt),
                  emphasize: true,
                },
              ]
            : []),
        ]}
      />

      {claim.description ? (
        <SectionCard title="Description" bodyClassName="px-3 py-4 sm:px-5">
          <MetaItem label="Notes">
            <p className="m-0 max-w-2xl whitespace-pre-wrap break-words leading-relaxed [overflow-wrap:anywhere]">
              {claim.description}
            </p>
          </MetaItem>
        </SectionCard>
      ) : null}

      <SectionCard title="Expense Items" bodyClassName="px-3 py-4 sm:px-5">
        <DocumentPreviewGroup documents={claim.items.flatMap(itemReceiptDocuments)}>
          <DataTable<ExpenseClaimItem>
            rowKey="id"
            className="erp-pro-table"
            size="small"
            tableLayout="fixed"
            columns={columns}
            dataSource={claim.items}
            pagination={false}
            scroll={{ x: 960 }}
          />
        </DocumentPreviewGroup>
      </SectionCard>
    </div>
  );
}
