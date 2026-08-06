'use client';

import { Alert, Skeleton, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { ApiRequestError } from '@/lib/api/errors';
import type { PurchaseRequestItem } from '@/lib/api/purchase-request.types';
import { usePurchaseRequest } from '@/lib/query/purchase-request';
import {
  formatCurrencyAmount,
  formatEtbAmount,
  formatPurchaseRequestEmployeeName,
  formatPurchaseRequestStatus,
  PR_GM_THRESHOLD_ETB,
  purchaseRequestStatusVariant,
  requiresGmApproval,
} from '@/lib/utils/purchase-request-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import { tokens } from '@/lib/theme/tokens';

/**
 * Purchase request body for the Approvals detail inbox (read-only).
 */
export default function PurchaseRequestDetail({
  sourceId,
}: {
  approvalRequestId: string;
  sourceId: string;
}): React.ReactNode {
  const detailQuery = usePurchaseRequest(sourceId);
  const request = detailQuery.data;

  if (detailQuery.isLoading && !request) {
    return (
      <div
        className="rounded-lg p-6"
        style={{
          background: tokens.colorCardBg,
          border: `1px solid ${tokens.colorBorder}`,
        }}
      >
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
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
      />
    );
  }

  const gmRequired = requiresGmApproval(request.totalEstimatedEtb);

  const columns: ColumnsType<PurchaseRequestItem> = [
    {
      title: 'Item',
      dataIndex: 'itemName',
      key: 'itemName',
      ellipsis: true,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (v: string | null | undefined) => v || '-',
    },
    {
      title: 'Qty',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 70,
      align: 'right',
    },
    { title: 'Unit', dataIndex: 'unit', key: 'unit', width: 80 },
    {
      title: 'Unit Price',
      key: 'unitPrice',
      width: 130,
      align: 'right',
      render: (_: unknown, row: PurchaseRequestItem) =>
        formatCurrencyAmount(row.unitPrice, row.currency),
    },
    {
      title: 'Total (ETB)',
      dataIndex: 'totalPriceEtb',
      key: 'totalPriceEtb',
      width: 130,
      align: 'right',
      render: (v: number | string) => formatEtbAmount(v),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
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
              {request.requestNumber}
            </span>
            <span style={{ color: tokens.colorBorder }}>·</span>
            <StatusBadge
              label={formatPurchaseRequestStatus(request.status)}
              variant={purchaseRequestStatusVariant(request.status)}
            />
            {gmRequired ? (
              <Tag color="orange">GM Approval Required</Tag>
            ) : (
              <Tag color="cyan">HR Approval Sufficient</Tag>
            )}
          </div>
          <h2
            className="text-lg font-semibold leading-snug m-0"
            style={{ color: tokens.colorTextPrimary }}
          >
            {request.title}
          </h2>
          <p className="mt-1 text-sm m-0" style={{ color: tokens.colorTextSecondary }}>
            Submitted by{' '}
            <span
              className="font-medium"
              style={{ color: tokens.colorTextPrimary }}
            >
              {formatPurchaseRequestEmployeeName(request.employee)}
            </span>
            {request.submittedAt
              ? ` · ${formatProjectDate(request.submittedAt)}`
              : null}
          </p>
        </div>
      </div>

      <SummaryStrip
        items={[
          { label: 'Items', value: String(request.items.length) },
          {
            label: 'Total (ETB)',
            value: formatEtbAmount(request.totalEstimatedEtb),
            emphasize: true,
          },
          {
            label: 'Required By',
            value: request.requiredByDate
              ? formatProjectDate(request.requiredByDate)
              : '-',
          },
          { label: 'Project', value: request.project?.name ?? '-' },
        ]}
      />

      <SectionCard title="Justification" bodyClassName="px-5 py-4">
        <MetaItem label="Reason for Purchase">
          <p className="whitespace-pre-wrap leading-relaxed m-0">
            {request.justification}
          </p>
        </MetaItem>
        {request.vendorName ? (
          <div className="mt-4">
            <MetaItem label="Preferred Vendor">
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
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Line Items" bodyClassName="px-5 py-4">
        <Table<PurchaseRequestItem>
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={request.items}
          pagination={false}
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

      {(request.documents?.length ?? 0) > 0 ? (
        <SectionCard title="Attachments" bodyClassName="px-5 py-4">
          <AttachmentDownloadList documents={request.documents} />
        </SectionCard>
      ) : null}
    </div>
  );
}
