'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';
import { Alert, Skeleton, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import DataTable from '@/components/ui/DataTable/DataTable';
import { DocumentPreviewGroup } from '@/components/shared/preview';
import DocumentImageThumb from '@/components/ui/DocumentImageThumb/DocumentImageThumb';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type { ExitPermitItem } from '@/lib/api/exit-permit.types';
import { useExitPermit } from '@/lib/query/exit-permit';
import { exitPermitItemImages } from '@/lib/utils/exit-permit-item-images';
import {
  formatExitPermitDepartmentName,
  formatExitPermitDirection,
  formatExitPermitEmployeeName,
} from '@/lib/utils/exit-permit-display';
import { formatProjectDate } from '@/lib/utils/project-display';

/**
 * Exit permit body for the Approvals detail inbox (read-only).
 * Header is rendered by ApprovalDetailPageContent - do not duplicate it here.
 */
export default function ExitPermitDetail({
  sourceId,
}: {
  approvalRequestId: string;
  sourceId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const detailQuery = useExitPermit(sourceId);
  const permit = detailQuery.data;

  if (detailQuery.isLoading && !permit) {
    return (
      <div className="erp-hr-travel-v2">
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !permit) {
    return (
      <Alert
        type="error"
        showIcon
        title={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : t('hr.messages.exitPermitNotFound')
        }
      />
    );
  }

  const columns: ColumnsType<ExitPermitItem> = [
    {
      title: t('hr.table.itemImage'),
      key: 'image',
      width: 56,
      render: (_: unknown, row: ExitPermitItem) => (
        <DocumentImageThumb
          documentId={row.documentId ?? row.image?.id}
          alt={row.itemName}
          fileName={row.image?.name}
          fileType={row.image?.fileType}
          size={40}
          emptyLabel={t('hr.labels.noItemImage')}
        />
      ),
    },
    {
      title: t('hr.table.itemName'),
      key: 'itemName',
      ellipsis: true,
      render: (_: unknown, row: ExitPermitItem) => (
        <div className="min-w-0">
          <p className="m-0 truncate font-medium">{row.itemName}</p>
          {row.issue?.trim() ? (
            <p className="m-0 mt-0.5 truncate text-xs text-[var(--ant-color-text-secondary)]">
              {row.issue}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      title: t('hr.table.quantity'),
      dataIndex: 'quantity',
      key: 'quantity',
      width: 72,
      align: 'right',
      render: (value: number | string) => String(value),
    },
    {
      title: t('hr.table.unit'),
      dataIndex: 'unit',
      key: 'unit',
      width: 72,
      render: (value: string | null | undefined) => value?.trim() || '-',
    },
  ];
  return (
    <div className="erp-hr-travel-v2 flex flex-col gap-3">
      <SummaryStrip
        items={[
          {
            label: t('hr.table.items'),
            value: String(permit.items.length),
          },
          {
            label: t('hr.table.direction'),
            value: formatExitPermitDirection(permit.direction, t),
          },
          {
            label: t('hr.table.date'),
            value: formatProjectDate(permit.date),
          },
          {
            label: t('hr.table.department'),
            value: formatExitPermitDepartmentName(permit.department),
          },
        ]}
      />

      <SectionCard
        title={t('hr.section.requestDetails')}
        bodyClassName="px-3 py-4 sm:px-5"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <MetaItem label={t('hr.table.employee')}>
            {formatExitPermitEmployeeName(permit.employee)}
          </MetaItem>
          <MetaItem label={t('hr.table.submittedBy')}>
            {formatExitPermitEmployeeName(
              permit.submitter ?? permit.creator,
            )}
          </MetaItem>
          <MetaItem label={t('hr.table.direction')}>
            <Tag
              color={permit.direction === 'ENTRANCE' ? 'green' : 'red'}
              className="rounded-xl"
            >
              {formatExitPermitDirection(permit.direction, t)}
            </Tag>
          </MetaItem>
          <MetaItem label={t('hr.table.date')}>
            {formatProjectDate(permit.date)}
          </MetaItem>
          {permit.isOnBehalf ? (
            <MetaItem label={t('hr.table.onBehalf')}>
              {t('hr.labels.yes')}
            </MetaItem>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        title={t('hr.section.items')}
        bodyClassName="px-3 py-4 sm:px-5"
      >
        <DocumentPreviewGroup documents={exitPermitItemImages(permit.items)}>
          <DataTable<ExitPermitItem>
            rowKey="id"
            className="erp-pro-table"
            size="small"
            columns={columns}
            dataSource={permit.items}
            pagination={false}
            scroll={false}
          />
        </DocumentPreviewGroup>
      </SectionCard>
    </div>
  );
}
