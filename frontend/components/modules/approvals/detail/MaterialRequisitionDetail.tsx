'use client';

import { Alert, Skeleton } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import DataTable from '@/components/ui/DataTable/DataTable';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { ApiRequestError } from '@/lib/api/errors';
import type { MaterialRequisitionItem } from '@/lib/api/material-requisition.types';
import { useMaterialRequisition } from '@/lib/query/material-requisition';
import {
  formatMaterialRequisitionEmployeeName,
  formatMaterialRequisitionStatus,
  materialRequisitionStatusVariant,
} from '@/lib/utils/material-requisition-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import { tokens } from '@/lib/theme/tokens';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

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

  if (detailQuery.isError || !requisition) {
    return (
      <Alert
        type="error"
        showIcon
        message={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : 'Material requisition not found'
        }
      />
    );
  }

  const columns: ColumnsType<MaterialRequisitionItem> = [
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
    <div className="flex flex-col gap-3">
      <div
        className="rounded-none overflow-hidden"
        style={{
          background: tokens.colorCardBg,
          border: `1px solid ${tokens.colorBorder}`,
        }}
      >
        <div className="px-3 py-4 sm:px-5">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: tokens.colorTextTertiary }}
            >
              {requisition.requestNumber}
            </span>
            <span style={{ color: tokens.colorBorder }}>·</span>
            <StatusBadge
              label={formatMaterialRequisitionStatus(requisition.status, t)}
              variant={materialRequisitionStatusVariant(requisition.status)}
            />
          </div>
          <h2
            className="text-lg font-semibold leading-snug m-0"
            style={{ color: tokens.colorTextPrimary }}
          >
            {requisition.title}
          </h2>
          <p
            className="mt-1 text-sm m-0"
            style={{ color: tokens.colorTextSecondary }}
          >
            Submitted by{' '}
            <span
              className="font-medium"
              style={{ color: tokens.colorTextPrimary }}
            >
              {formatMaterialRequisitionEmployeeName(requisition.employee)}
            </span>
            {requisition.submittedAt
              ? ` · ${formatProjectDate(requisition.submittedAt)}`
              : null}
          </p>
        </div>
      </div>

      <SummaryStrip
        items={[
          { label: 'Items', value: String(requisition.items.length) },
          {
            label: 'Required By',
            value: requisition.requiredByDate
              ? formatProjectDate(requisition.requiredByDate)
              : '-',
          },
          { label: 'Project', value: requisition.project?.name ?? '-' },
          {
            label: 'Warehouse',
            value: requisition.warehouseLocation ?? '-',
          },
        ]}
      />

      <SectionCard title="Purpose" bodyClassName="px-3 py-4 sm:px-5">
        <MetaItem label="What are the materials needed for?">
          <p className="whitespace-pre-wrap leading-relaxed m-0">
            {requisition.purpose}
          </p>
        </MetaItem>
      </SectionCard>

      <SectionCard title="Items" bodyClassName="px-3 py-4 sm:px-5">
        <DataTable<MaterialRequisitionItem>
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
        <SectionCard title="Attachments" bodyClassName="px-3 py-4 sm:px-5">
          <AttachmentDownloadList documents={requisition.documents} />
        </SectionCard>
      ) : null}
    </div>
  );
}
