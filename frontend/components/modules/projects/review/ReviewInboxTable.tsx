'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type { ReviewInboxItem } from '@/lib/api/epc.types';
import { useReviewInbox } from '@/lib/query/epc-workspace';
import { formatProjectDate } from '@/lib/utils/project-display';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

export default function ReviewInboxTable({
  tierFilter = 'ALL',
}: {
  tierFilter?: string;
}): React.ReactNode {
  const inboxQuery = useReviewInbox();
  const { t } = useEpcTranslation();

  const filtered = useMemo(() => {
    const items = inboxQuery.data ?? [];
    if (tierFilter === 'ALL') {
      return items;
    }
    return items.filter((item) => item.currentTier === tierFilter);
  }, [inboxQuery.data, tierFilter]);

  const columns: ColumnsType<ReviewInboxItem> = [
    {
      title: 'Package',
      dataIndex: 'designPackageName',
      key: 'designPackageName',
      render: (name: string, record) => (
        <Link
          href={`/design-packages/${record.designPackageId}/review?projectId=${record.projectId}&disciplineId=${record.taskDisciplineId}`}
        >
          {name}
        </Link>
      ),
    },
    { title: 'Project', dataIndex: 'projectName', key: 'projectName' },
    { title: 'Discipline', dataIndex: 'disciplineName', key: 'disciplineName' },
    {
      title: 'Tier',
      dataIndex: 'currentTier',
      key: 'currentTier',
      render: (tier: string) => tier.replace(/_/g, ' '),
    },
    {
      title: 'SLA deadline',
      dataIndex: 'slaDeadlineAt',
      key: 'slaDeadlineAt',
      render: (value: string | null, record) =>
        value ? (
          <span className={record.slaOverdue ? 'text-red-600 font-medium' : undefined}>
            {formatProjectDate(value)}
          </span>
        ) : (
          '—'
        ),
    },
    {
      title: 'SLA',
      dataIndex: 'slaOverdue',
      key: 'slaOverdue',
      width: 90,
      render: (overdue: boolean) =>
        overdue ? (
          <StatusBadge label="Overdue" variant="error" />
        ) : (
          <StatusBadge label="OK" variant="success" />
        ),
    },
    {
      title: 'Opened',
      dataIndex: 'openedAt',
      key: 'openedAt',
      render: (value: string) => formatProjectDate(value),
    },
  ];

  return (
    <DataTable<ReviewInboxItem>
      rowKey="reviewSessionId"
      columns={columns}
      dataSource={filtered}
      loading={inboxQuery.isLoading}
      locale={{ emptyText: t('empty.noReviewInbox') }}
    />
  );
}
