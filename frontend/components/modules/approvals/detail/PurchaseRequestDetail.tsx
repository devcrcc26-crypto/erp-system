'use client';

import { Alert, Skeleton, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import DataTable from '@/components/ui/DataTable/DataTable';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type { PurchaseRequestItem } from '@/lib/api/purchase-request.types';
import { usePurchaseRequest } from '@/lib/query/purchase-request';
import {
  formatCurrencyAmount,
  formatEtbAmount,
  formatPurchaseItemDescription,
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
  const { t } = useEpcTranslation();
  const detailQuery = usePurchaseRequest(sourceId);
  const request = detailQuery.data;

  if (detailQuery.isLoading && !request) {
    return (
      <div
        className="rounded-none p-6"
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
        title={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : t('hr.messages.purchaseRequestNotFound')
        }
      />
    );
  }

  const columns: ColumnsType<PurchaseRequestItem> = [
    {
      title: t('hr.table.itemName'),
      dataIndex: 'itemName',
      key: 'itemName',
      ellipsis: true,
    },
    {
      title: t('hr.table.descriptionWithModelSpec'),
      key: 'description',
      ellipsis: true,
      render: (_: unknown, row: PurchaseRequestItem) =>
        formatPurchaseItemDescription(row.description, row.modelSpec),
    },
    {
      title: t('hr.table.itemImage'),
      key: 'image',
      width: 120,
      render: (_: unknown, row: PurchaseRequestItem) =>
        row.image ? (
          <AttachmentDownloadList documents={[row.image]} />
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
      width: 70,
      align: 'right',
    },
    { title: t('hr.table.unit'), dataIndex: 'unit', key: 'unit', width: 80 },
    {
      title: t('hr.table.unitPrice'),
      key: 'unitPrice',
      width: 130,
      align: 'right',
      render: (_: unknown, row: PurchaseRequestItem) =>
        formatCurrencyAmount(row.unitPrice, row.currency),
    },
    {
      title: t('hr.table.total'),
      dataIndex: 'totalPriceEtb',
      key: 'totalPriceEtb',
      width: 130,
      align: 'right',
      render: (value: number | string) => formatEtbAmount(value),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <SummaryStrip
        items={[
          {
            label: t('hr.table.items'),
            value: String(request.items.length),
          },
          {
            label: t('hr.form.estimatedTotal'),
            value: formatEtbAmount(request.totalEstimatedEtb),
            emphasize: true,
          },
          {
            label: t('hr.table.requiredBy'),
            value: request.requiredByDate
              ? formatProjectDate(request.requiredByDate)
              : '—',
          },
        ]}
      />

      <SectionCard
        title={t('hr.section.requestDetails')}
        bodyClassName="px-3 py-4 sm:px-5"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <MetaItem label={t('hr.form.justification')}>
            <p className="m-0 whitespace-pre-wrap leading-relaxed">
              {request.justification}
            </p>
          </MetaItem>
          {request.vendorName ? (
            <MetaItem label={t('hr.form.vendor')}>
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
          ) : null}
          {request.requiredByDate ? (
            <MetaItem label={t('hr.form.requiredByDate')}>
              {formatProjectDate(request.requiredByDate)}
            </MetaItem>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        title={t('hr.section.items')}
        bodyClassName="px-3 py-4 sm:px-5"
      >
        <DataTable<PurchaseRequestItem>
          rowKey="id"
          className="erp-pro-table"
          size="small"
          columns={columns}
          dataSource={request.items}
          pagination={false}
          scroll={false}
          footer={
            request.items.length > 0
              ? () => (
                  <div className="flex justify-end gap-4 pr-2 text-sm font-medium">
                    <span style={{ color: tokens.colorTextSecondary }}>
                      {t('hr.form.itemCount', {
                        count: request.items.length,
                      })}
                    </span>
                    <span style={{ color: tokens.colorTextPrimary }}>
                      {t('hr.form.estimatedTotal')}:{' '}
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
        <SectionCard
          title={t('hr.section.attachments')}
          bodyClassName="px-3 py-4 sm:px-5"
        >
          <AttachmentDownloadList documents={request.documents} />
        </SectionCard>
      ) : null}
    </div>
  );
}
