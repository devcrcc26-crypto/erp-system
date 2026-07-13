'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import DesignPackageBuilder from '@/components/modules/projects/design-packages/DesignPackageBuilder';
import type { MyWorkItem } from '@/lib/api/epc.types';
import { useMyWork } from '@/lib/query/epc-workspace';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  useCanViewMyWork,
  usePermissionsLoading,
} from '@/hooks/use-pm-capabilities';
import {
  reviewModeHref,
  scheduleSubtaskWorkspaceHref,
} from '@/lib/utils/schedule-subtasks';

const REVIEWER_TIER_ROLES = new Set([
  'REVIEWER',
  'DISCIPLINE_LEAD',
  'DEPT_CHIEF',
  'INSTITUTE_CHIEF',
]);

function workItemHref(item: MyWorkItem): string {
  if (item.kind === 'SUBTASK_ROLE' && item.designPackageId) {
    // DESIGNER/SUPPORTING_DESIGNER -> Designer View; REVIEWER/DISCIPLINE_LEAD/
    // DEPT_CHIEF/INSTITUTE_CHIEF -> Review Mode when submitted; DISCIPLINE_OWNER (or
    // unresolved) -> the same read-only detail page as Designer View, since no
    // separate read-only route exists today.
    if (item.primaryRole && REVIEWER_TIER_ROLES.has(item.primaryRole)) {
      if (item.packageStatus === 'SUBMITTED') {
        return reviewModeHref(item.projectId, item.taskDisciplineId, item.designPackageId);
      }
      return scheduleSubtaskWorkspaceHref(
        item.projectId,
        item.taskDisciplineId,
        item.designPackageId,
      );
    }
    return scheduleSubtaskWorkspaceHref(
      item.projectId,
      item.taskDisciplineId,
      item.designPackageId,
    );
  }
  return `/projects/${item.projectId}/schedule/tasks/${item.taskId}`;
}

export default function MyWorkPageContent({
  projectId,
}: {
  projectId?: string;
} = {}): React.ReactNode {
  const permLoading = usePermissionsLoading();
  const canViewMyWork = useCanViewMyWork();
  const workQuery = useMyWork(projectId);
  const { t } = useEpcTranslation();
  const [addSubtaskFor, setAddSubtaskFor] = useState<string | null>(null);

  if (permLoading || workQuery.isLoading) {
    return <PageLoadingSkeleton />;
  }

  if (!canViewMyWork) {
    return (
      <Alert
        type="warning"
        showIcon
        title="You do not have access to assigned work."
      />
    );
  }

  const columns: ColumnsType<MyWorkItem> = [
    {
      title: 'Type',
      key: 'kind',
      width: 140,
      render: (_value, record) => (
        <StatusBadge
          label={record.kind === 'DISCIPLINE_LEAD' ? 'Discipline lead' : 'Subtask'}
          variant={record.kind === 'DISCIPLINE_LEAD' ? 'info' : 'orange'}
        />
      ),
    },
    {
      title: 'Task',
      key: 'task',
      ellipsis: true,
      render: (_value, record) => (
        <div>
          <p className="font-medium text-slate-900">{record.taskName}</p>
          <p className="text-xs text-slate-500">{record.disciplineName}</p>
        </div>
      ),
    },
    {
      title: 'Subtask',
      key: 'subtask',
      ellipsis: true,
      render: (_value, record) => record.subtaskName ?? '—',
    },
    {
      title: 'Your role',
      dataIndex: 'roleLabel',
      key: 'roleLabel',
      width: 220,
      ellipsis: true,
    },
  ...(projectId
      ? []
      : [
          {
            title: 'Project',
            key: 'project',
            ellipsis: true,
            render: (_value: unknown, record: MyWorkItem) => (
              <div>
                <p className="font-medium text-slate-900">{record.projectName}</p>
                <p className="text-xs text-slate-500">{record.projectNumber}</p>
              </div>
            ),
          } as const,
        ]),
    {
      title: 'Status',
      key: 'status',
      width: 140,
      render: (_value, record) =>
        record.projectedStatus ? (
          <StatusBadge
            label={record.projectedStatus.replace(/_/g, ' ')}
            variant="info"
          />
        ) : (
          '—'
        ),
    },
    {
      title: 'Subtasks',
      key: 'subtasks',
      width: 100,
      render: (_value, record) =>
        record.kind === 'DISCIPLINE_LEAD' ? (record.subtaskCount ?? 0) : '—',
    },
    {
      title: '',
      key: 'actions',
      width: 200,
      fixed: 'right',
      render: (_value, record) =>
        record.kind === 'DISCIPLINE_LEAD' ? (
          <Space size="small">
            <Link href={workItemHref(record)}>
              <Button type="link" className="!px-0">
                View task
              </Button>
            </Link>
            <Button
              type="link"
              className="!px-0"
              onClick={() => setAddSubtaskFor(record.taskDisciplineId)}
            >
              Add subtask
            </Button>
          </Space>
        ) : (
          <Link href={workItemHref(record)}>
            <Button type="link" className="!px-0">
              Open
            </Button>
          </Link>
        ),
    },
  ];

  const activeItem = workQuery.data?.find(
    (item) => item.taskDisciplineId === addSubtaskFor,
  );

  return (
    <FormLayout
      title={t('pages.myWork.title')}
      description="Tasks you lead and subtasks where you hold a role."
    >
      <DataTable<MyWorkItem>
        rowKey={(record) =>
          record.designPackageId
            ? `subtask-${record.designPackageId}`
            : `lead-${record.taskDisciplineId}`
        }
        size="middle"
        columns={columns}
        dataSource={workQuery.data ?? []}
        scroll={{ x: 960 }}
        locale={{ emptyText: t('empty.noAssignedWork') }}
      />

      {addSubtaskFor && activeItem && (
        <DesignPackageBuilder
          open={true}
          projectId={activeItem.projectId}
          taskDisciplineId={addSubtaskFor}
          editing={null}
          onClose={() => setAddSubtaskFor(null)}
          onSaved={() => {
            void workQuery.refetch();
            setAddSubtaskFor(null);
          }}
        />
      )}
    </FormLayout>
  );
}
