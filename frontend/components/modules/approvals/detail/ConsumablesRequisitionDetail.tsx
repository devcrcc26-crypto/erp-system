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
import type { ConsumablesRequisitionItem } from '@/lib/api/consumables-requisition.types';
import { useConsumablesRequisition } from '@/lib/query/consumables-requisition';
import { formatProjectDate } from '@/lib/utils/project-display';

/**
 * Consumables requisition body for the Approvals detail inbox (read-only).
 * Header is rendered by ApprovalDetailPageContent - do not duplicate it here.
 */
export default function ConsumablesRequisitionDetail({
  sourceId,
}: {
  approvalRequestId: string;
  sourceId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const detailQuery = useConsumablesRequisition(sourceId);
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
        message={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : 'Consumables requisition not found'
        }
      />
    );
  }

  const columns: ColumnsType<ConsumablesRequisitionItem> = [
    {
      title: 'Item Name',
      dataIndex: 'itemName',
      key: 'itemName',
      ellipsis: true,
    },
    {
      title: 'Item Code',
      dataIndex: 'itemCode',
      key: 'itemCode',
      width: 120,
      render: (v: string | null | undefined) => v || '-',
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (v: string | null | undefined) => v || '-',
    },
    {
      title: 'Quantity',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 90,
      align: 'right',
    },
    { title: 'Unit', dataIndex: 'unit', key: 'unit', width: 80 },
  ];

  return (
    <div className="erp-hr-travel-v2 flex flex-col gap-3">
      <SummaryStrip
        items={[
          { label: 'Items', value: String(requisition.items.length) },
          {
            label: 'Required By',
            value: requisition.requiredByDate
              ? formatProjectDate(requisition.requiredByDate)
              : '-',
          },
          { label: 'Department', value: requisition.department ?? '-' },
        ]}
      />

      <SectionCard title="Purpose" bodyClassName="px-3 py-4 sm:px-5">
        <MetaItem label="What are these consumables needed for?">
          <p className="whitespace-pre-wrap leading-relaxed m-0">
            {requisition.purpose}
          </p>
        </MetaItem>
      </SectionCard>

      <SectionCard title="Items" bodyClassName="px-3 py-4 sm:px-5">
        <DataTable<ConsumablesRequisitionItem>
          rowKey="id"
          className="erp-pro-table"
          size="small"
          columns={columns}
          dataSource={requisition.items}
          pagination={false}
          scroll={false}
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
