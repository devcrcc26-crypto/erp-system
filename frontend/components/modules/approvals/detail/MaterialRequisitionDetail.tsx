'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';
import { Alert, Skeleton } from 'antd';
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
import type { MaterialRequisitionItem } from '@/lib/api/material-requisition.types';
import { useMaterialRequisition } from '@/lib/query/material-requisition';
import { formatProjectDate } from '@/lib/utils/project-display';
import { tokens } from '@/lib/theme/tokens';

/**
 * Material requisition body for the Approvals detail inbox (read-only).
 */
export default function MaterialRequisitionDetail({
  sourceId,
}: {
  approvalRequestId: string;
  sourceId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const detailQuery = useMaterialRequisition(sourceId);
  const requisition = detailQuery.data;

  if (detailQuery.isLoading && !requisition) {
    return (
      <div className="erp-hr-travel-v2">
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !requisition) {
    return (
      <Alert
        type="error"
        showIcon
        title={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : t('hr.messages.materialRequisitionNotFound')
        }
      />
    );
  }

  const columns: ColumnsType<MaterialRequisitionItem> = [
    {
      title: t('hr.table.itemName'),
      dataIndex: 'itemName',
      key: 'itemName',
      ellipsis: true,
    },
    {
      title: t('hr.table.itemCode'),
      dataIndex: 'itemCode',
      key: 'itemCode',
      width: 120,
      render: (value: string | null | undefined) => value || '-',
    },
    {
      title: t('hr.table.description'),
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (value: string | null | undefined) => value || '-',
    },
    {
      title: t('hr.table.quantity'),
      dataIndex: 'quantity',
      key: 'quantity',
      width: 90,
      align: 'right',
    },
    { title: t('hr.table.unit'), dataIndex: 'unit', key: 'unit', width: 80 },
  ];

  return (
    <div className="erp-hr-travel-v2 flex flex-col gap-3">
      <SummaryStrip
        items={[
          {
            label: t('hr.table.items'),
            value: String(requisition.items.length),
          },
          {
            label: t('hr.table.requiredBy'),
            value: requisition.requiredByDate
              ? formatProjectDate(requisition.requiredByDate)
              : '-',
          },
          {
            label: t('hr.form.warehouseLocation'),
            value: requisition.warehouseLocation ?? '-',
          },
        ]}
      />

      <SectionCard
        title={t('hr.section.requestDetails')}
        bodyClassName="px-3 py-4 sm:px-5"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <MetaItem label={t('hr.labels.purpose')}>
            <p className="m-0 whitespace-pre-wrap leading-relaxed">
              {requisition.purpose}
            </p>
          </MetaItem>
          {requisition.requiredByDate ? (
            <MetaItem label={t('hr.form.requiredByDate')}>
              {formatProjectDate(requisition.requiredByDate)}
            </MetaItem>
          ) : null}
          {requisition.warehouseLocation ? (
            <MetaItem label={t('hr.form.warehouseLocation')}>
              {requisition.warehouseLocation}
            </MetaItem>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        title={t('hr.section.items')}
        bodyClassName="px-3 py-4 sm:px-5"
      >
        <DataTable<MaterialRequisitionItem>
          rowKey="id"
          className="erp-pro-table"
          size="small"
          columns={columns}
          dataSource={requisition.items}
          pagination={false}
          scroll={false}
          footer={
            requisition.items.length > 0
              ? () => (
                  <div className="flex justify-end pr-2 text-sm font-medium">
                    <span style={{ color: tokens.colorTextSecondary }}>
                      {t('hr.form.itemCount', {
                        count: requisition.items.length,
                      })}
                    </span>
                  </div>
                )
              : undefined
          }
        />
      </SectionCard>

      {(requisition.documents?.length ?? 0) > 0 ? (
        <SectionCard
          title={t('hr.section.attachments')}
          bodyClassName="px-3 py-4 sm:px-5"
        >
          <AttachmentDownloadList documents={requisition.documents} />
        </SectionCard>
      ) : null}
    </div>
  );
}
