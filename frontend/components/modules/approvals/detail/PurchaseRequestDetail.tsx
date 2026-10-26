'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';
import { Alert, Skeleton, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import { DocumentPreviewGroup } from '@/components/shared/preview';
import DataTable from '@/components/ui/DataTable/DataTable';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type { PurchaseRequestItem } from '@/lib/api/purchase-request.types';
import { usePurchaseRequest } from '@/lib/query/purchase-request';
import {
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
      <div className="erp-hr-travel-v2">
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
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
      render: (value: string, row: PurchaseRequestItem) => (
        <div className="min-w-0 break-words">
          <span>{value || '-'}</span>
          <p className="erp-users-cell-sub m-0 mt-0.5 md:hidden">
            {formatPurchaseItemDescription(row.description, row.modelSpec)}
          </p>
          <p className="erp-users-cell-sub m-0 mt-0.5 tabular-nums sm:hidden">
            {row.quantity} {row.unit}
          </p>
          <p className="erp-users-cell-sub m-0 mt-0.5 tabular-nums lg:hidden">
            {formatEtbAmount(row.unitPrice)}
          </p>
        </div>
      ),
    },
    {
      title: t('hr.table.descriptionWithModelSpec'),
      key: 'description',
      responsive: ['md'],
      render: (_: unknown, row: PurchaseRequestItem) => (
        <div className="min-w-0 break-words">
          {formatPurchaseItemDescription(row.description, row.modelSpec)}
        </div>
      ),
    },
    {
      title: t('hr.table.itemImage'),
      key: 'image',
      width: 96,
      render: (_: unknown, row: PurchaseRequestItem) =>
        row.image ? (
          <AttachmentDownloadList documents={[row.image]} compact />
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
      responsive: ['sm'],
      render: (value: number | string) => (
        <span className="tabular-nums">{value}</span>
      ),
    },
    {
      title: t('hr.table.unit'),
      dataIndex: 'unit',
      key: 'unit',
      width: 80,
      responsive: ['sm'],
    },
    {
      title: t('hr.table.unitPrice'),
      key: 'unitPrice',
      width: 130,
      align: 'right',
      responsive: ['lg'],
      render: (_: unknown, row: PurchaseRequestItem) => (
        <span className="tabular-nums whitespace-nowrap">
          {formatEtbAmount(row.unitPrice)}
        </span>
      ),
    },
    {
      title: t('hr.table.total'),
      dataIndex: 'totalPriceEtb',
      key: 'totalPriceEtb',
      width: 130,
      align: 'right',
      render: (value: number | string) => (
        <span className="tabular-nums whitespace-nowrap">
          {formatEtbAmount(value)}
        </span>
      ),
    },
  ];

  return (
    <div className="erp-hr-travel-v2 flex flex-col gap-3">
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
              : '-',
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
              {request.vendorEmail ? (
                <p
                  className="m-0 text-xs"
                  style={{ color: tokens.colorTextSecondary }}
                >
                  {request.vendorEmail}
                </p>
              ) : null}
              {request.vendorPhone ? (
                <p
                  className="m-0 text-xs"
                  style={{ color: tokens.colorTextSecondary }}
                >
                  {request.vendorPhone}
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
        <DocumentPreviewGroup documents={request.items.flatMap((item) => (item.image ? [item.image] : []))}>
          <DataTable<PurchaseRequestItem>
            rowKey="id"
            className="erp-pro-table"
            size="small"
            columns={columns}
            dataSource={request.items}
            pagination={false}
            scroll={{ x: 'max-content' }}
            footer={
              request.items.length > 0
                ? () => (
                    <div className="flex flex-wrap justify-end gap-x-4 gap-y-1 pr-2 text-sm font-medium">
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
        </DocumentPreviewGroup>
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
