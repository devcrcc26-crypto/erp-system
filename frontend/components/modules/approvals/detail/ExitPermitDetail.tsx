'use client';

import { Alert, Skeleton, Tag } from 'antd';
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
import type { ExitPermitItem } from '@/lib/api/exit-permit.types';
import { useExitPermit } from '@/lib/query/exit-permit';
import {
  formatExitPermitDepartmentName,
  formatExitPermitDirection,
  formatExitPermitEmployeeName,
} from '@/lib/utils/exit-permit-display';
import { formatProjectDate } from '@/lib/utils/project-display';

/**
 * Exit permit body for the Approvals detail inbox (read-only).
 * Header is rendered by ApprovalDetailPageContent — do not duplicate it here.
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
      <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white p-6">
        <Skeleton active paragraph={{ rows: 8 }} />
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
      title: t('hr.table.itemName'),
      dataIndex: 'itemName',
      key: 'itemName',
      ellipsis: true,
    },
    {
      title: t('hr.table.issue'),
      dataIndex: 'issue',
      key: 'issue',
      ellipsis: true,
      render: (value: string | null | undefined) => value?.trim() || '—',
    },
    {
      title: t('hr.table.quantity'),
      dataIndex: 'quantity',
      key: 'quantity',
      width: 90,
      align: 'right',
      render: (value: number | string) => String(value),
    },
    {
      title: t('hr.table.unit'),
      dataIndex: 'unit',
      key: 'unit',
      width: 80,
      render: (value: string | null | undefined) => value?.trim() || '—',
    },
    {
      title: t('hr.table.itemImage'),
      key: 'image',
      width: 120,
      render: (_: unknown, row: ExitPermitItem) =>
        row.image ? (
          <AttachmentDownloadList documents={[row.image]} compact />
        ) : (
          '—'
        ),
    },
  ];
  return (
    <div className="flex flex-col gap-3">
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
        <DataTable<ExitPermitItem>
          rowKey="id"
          className="erp-pro-table"
          size="small"
          columns={columns}
          dataSource={permit.items}
          pagination={false}
          scroll={false}
        />
      </SectionCard>
    </div>
  );
}
