'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Tabs } from 'antd';
import { Inbox } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import ReviewInboxDrawer from '@/components/modules/projects/review/ReviewInboxDrawer';
import type { ReviewInboxItem } from '@/lib/api/epc.types';
import { useReviewInbox } from '@/lib/query/epc-workspace';
import {
  useCanViewReviewInbox,
  usePermissionsLoading,
} from '@/hooks/use-pm-capabilities';
import { formatProjectDate } from '@/lib/utils/project-display';
import { reviewModeHref } from '@/lib/utils/schedule-subtasks';
import { formatDisciplineNumber } from '@/lib/utils/discipline-display';

export default function ReviewInboxTable({
  projectId,
  tierFilter = 'ALL',
}: {
  projectId?: string;
  tierFilter?: string;
}): React.ReactNode {
  const permLoading = usePermissionsLoading();
  const canViewReviewInbox = useCanViewReviewInbox();
  const inboxQuery = useReviewInbox(projectId);
  const [activeSection, setActiveSection] = useState<'PENDING' | 'COMPLETED'>(
    'PENDING',
  );
  const [drawerItem, setDrawerItem] = useState<ReviewInboxItem | null>(null);

  const filtered = useMemo(() => {
    const items = inboxQuery.data ?? [];
    if (tierFilter === 'ALL') {
      return items;
    }
    return items.filter((item) => item.currentTier === tierFilter);
  }, [inboxQuery.data, tierFilter]);

  const pendingItems = useMemo(
    () => filtered.filter((item) => item.inboxStatus === 'PENDING'),
    [filtered],
  );
  const completedItems = useMemo(
    () => filtered.filter((item) => item.inboxStatus === 'COMPLETED'),
    [filtered],
  );

  if (permLoading || inboxQuery.isLoading) {
    return <PageLoadingSkeleton />;
  }

  if (!canViewReviewInbox) {
    return null;
  }

  const baseColumns: ColumnsType<ReviewInboxItem> = [
    {
      title: 'Subtask',
      dataIndex: 'designPackageName',
      key: 'designPackageName',
      ellipsis: { showTitle: true },
      render: (name: string, record) => (
        <Link
          href={reviewModeHref(
            record.projectId,
            record.taskDisciplineId,
            record.designPackageId,
            record.reviewSessionId,
            record.inboxStatus === 'COMPLETED'
              ? {
                  readOnly: true,
                  actionTaken: record.completedAction,
                  actionTakenAt: record.actionTakenAt,
                }
              : undefined,
          )}
        >
          {name}
        </Link>
      ),
    },
    ...(projectId
      ? []
      : [
          {
            title: 'Project',
            dataIndex: 'projectName',
            key: 'projectName',
            ellipsis: { showTitle: true },
          } as const,
        ]),
    {
      title: 'Discipline',
      key: 'disciplineIndex',
      render: (_value, record) => (
        <div>
          <p>
            {record.overseasTaskNumber ?? record.taskIdCode ?? '-'}-
            {formatDisciplineNumber(record.disciplineIndex)}
          </p>
          <p className="text-xs text-slate-500">{record.disciplineName}</p>
        </div>
      ),
    },
    {
      title: 'Tier',
      dataIndex: 'currentTier',
      key: 'currentTier',
      render: (tier: string) => tier.replace(/_/g, ' '),
    },
    {
      key: 'view',
      width: 80,
      render: (_value, record) => (
        <Button size="small" onClick={() => setDrawerItem(record)}>
          View
        </Button>
      ),
    },
  ];

  const pendingColumns: ColumnsType<ReviewInboxItem> = [
    ...baseColumns,
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
          '-'
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

  const completedColumns: ColumnsType<ReviewInboxItem> = [
    ...baseColumns,
    {
      title: 'Session status',
      dataIndex: 'sessionStatus',
      key: 'sessionStatus',
      render: (value: string) => value.replace(/_/g, ' '),
    },
    {
      title: 'Action taken',
      dataIndex: 'completedAction',
      key: 'completedAction',
      render: (action: ReviewInboxItem['completedAction']) =>
        action === 'RETURNED' ? (
          <StatusBadge label="Returned" variant="warning" />
        ) : action === 'APPROVED' ? (
          <StatusBadge label="Approved" variant="success" />
        ) : (
          '-'
        ),
    },
    {
      title: 'Action date',
      dataIndex: 'actionTakenAt',
      key: 'actionTakenAt',
      render: (value: string | null) => (value ? formatProjectDate(value) : '-'),
    },
  ];

  const emptyState = (
    <TableEmptyState
      icon={<Inbox />}
      title="Nothing here"
      description="Subtasks assigned to you will appear here"
    />
  );

  return (
    <div data-testid="review-inbox-table">
      <Tabs
        activeKey={activeSection}
        onChange={(key) => setActiveSection(key as 'PENDING' | 'COMPLETED')}
        items={[
          {
            key: 'PENDING',
            label: (
              <Badge count={pendingItems.length} size="small" offset={[8, 0]}>
                <span>Pending</span>
              </Badge>
            ),
            children: (
              <DataTable<ReviewInboxItem>
                rowKey="reviewSessionId"
                columns={pendingColumns}
                dataSource={pendingItems}
                locale={{ emptyText: emptyState }}
              />
            ),
          },
          {
            key: 'COMPLETED',
            label: (
              <Badge count={completedItems.length} size="small" offset={[8, 0]}>
                <span>Completed</span>
              </Badge>
            ),
            children: (
              <DataTable<ReviewInboxItem>
                rowKey="reviewSessionId"
                columns={completedColumns}
                dataSource={completedItems}
                locale={{ emptyText: emptyState }}
              />
            ),
          },
        ]}
      />

      <ReviewInboxDrawer
        open={drawerItem !== null}
        onClose={() => setDrawerItem(null)}
        item={drawerItem}
        onActionComplete={() => {
          void inboxQuery.refetch();
          setDrawerItem(null);
        }}
      />
    </div>
  );
}
