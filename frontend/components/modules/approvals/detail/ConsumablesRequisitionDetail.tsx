'use client';

import { Alert, Skeleton, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { ApiRequestError } from '@/lib/api/errors';
import type { ConsumablesRequisitionItem } from '@/lib/api/consumables-requisition.types';
import { useConsumablesRequisition } from '@/lib/query/consumables-requisition';
import {
  formatConsumablesRequisitionEmployeeName,
  formatConsumablesRequisitionStatus,
  consumablesRequisitionStatusVariant,
} from '@/lib/utils/consumables-requisition-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import { tokens } from '@/lib/theme/tokens';

/**
 * Consumables requisition body for the Approvals detail inbox (read-only).
 */
export default function ConsumablesRequisitionDetail({
  sourceId,
}: {
  approvalRequestId: string;
  sourceId: string;
}): React.ReactNode {
  const detailQuery = useConsumablesRequisition(sourceId);
  const requisition = detailQuery.data;

  if (detailQuery.isLoading && !requisition) {
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
    <div className="flex flex-col gap-4">
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
              {requisition.requestNumber}
            </span>
            <span style={{ color: tokens.colorBorder }}>·</span>
            <StatusBadge
              label={formatConsumablesRequisitionStatus(requisition.status)}
              variant={consumablesRequisitionStatusVariant(requisition.status)}
            />
            {requisition.declarationConfirmed ? (
              <Tag color="green">Declaration confirmed</Tag>
            ) : null}
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
              {formatConsumablesRequisitionEmployeeName(requisition.employee)}
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
          { label: 'Department', value: requisition.department ?? '-' },
        ]}
      />

      <SectionCard title="Purpose" bodyClassName="px-5 py-4">
        <MetaItem label="What are these consumables needed for?">
          <p className="whitespace-pre-wrap leading-relaxed m-0">
            {requisition.purpose}
          </p>
        </MetaItem>
      </SectionCard>

      <SectionCard title="Items" bodyClassName="px-5 py-4">
        <Table<ConsumablesRequisitionItem>
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={requisition.items}
          pagination={false}
        />
      </SectionCard>
    </div>
  );
}
