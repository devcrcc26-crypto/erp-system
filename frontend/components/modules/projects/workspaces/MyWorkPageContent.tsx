'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Select, Space, Switch } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import DesignPackageBuilder from '@/components/modules/projects/design-packages/DesignPackageBuilder';
import type { DesignPackageProjectedStatus, MyWorkItem } from '@/lib/api/epc.types';
import { useMyWork } from '@/lib/query/epc-workspace';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  useCanViewMyWork,
  useEpcCapabilities,
  usePermissionsLoading,
  usePmCapabilities,
} from '@/hooks/use-pm-capabilities';
import { hasProjectSidebarAccess } from '@/lib/navigation/project-nav-visibility';
import {
  reviewModeHref,
  scheduleDisciplineWorkspaceHref,
  scheduleSubtaskWorkspaceHref,
} from '@/lib/utils/schedule-subtasks';
import { PROJECTED_STATUS_LABELS } from '@/lib/utils/epc-display';

const PROJECTED_STATUS_OPTIONS: DesignPackageProjectedStatus[] = [
  'IN_PROGRESS',
  'PENDING_LEAD',
  'APPROVED',
  'REWORK_REQUIRED',
  'LOCKED',
];

const STATUS_FILTER_OPTIONS = PROJECTED_STATUS_OPTIONS.map((status) => ({
  value: status,
  label: PROJECTED_STATUS_LABELS[status],
}));

const REVIEWER_TIER_ROLES = new Set([
  'REVIEWER',
  'DISCIPLINE_LEAD',
  'DEPT_CHIEF',
  'INSTITUTE_CHIEF',
]);

function workItemHref(item: MyWorkItem): string {
  if (item.kind === 'DISCIPLINE_LEAD') {
    return scheduleDisciplineWorkspaceHref(
      item.projectId,
      item.taskDisciplineId,
    );
  }

  if (item.kind === 'SUBTASK_ROLE' && item.designPackageId) {
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

  return '/my-work';
}

function matchesSearch(item: MyWorkItem, term: string): boolean {
  if (!term) {
    return true;
  }
  const haystack = [
    item.taskName,
    item.disciplineName,
    item.subtaskName,
    item.projectName,
    item.projectNumber,
    item.roleLabel,
    item.projectedStatus,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(term);
}

export default function MyWorkPageContent({
  projectId,
}: {
  projectId?: string;
} = {}): React.ReactNode {
  const permLoading = usePermissionsLoading();
  const canViewMyWork = useCanViewMyWork();
  const pm = usePmCapabilities();
  const epc = useEpcCapabilities();
  const hasProjectAccess = hasProjectSidebarAccess(epc, pm);
  const workQuery = useMyWork(projectId);
  const { t } = useEpcTranslation();
  const [addSubtaskFor, setAddSubtaskFor] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<
    DesignPackageProjectedStatus | undefined
  >();
  const [showSubtasks, setShowSubtasks] = useState(true);

  const allItems = workQuery.data ?? [];

  const projectOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of allItems) {
      seen.set(item.projectId, item.projectName);
    }
    return [...seen.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [allItems]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allItems.filter((item) => {
      if (!showSubtasks && item.kind === 'SUBTASK_ROLE') {
        return false;
      }
      if (projectFilter && item.projectId !== projectFilter) {
        return false;
      }
      if (statusFilter && item.projectedStatus !== statusFilter) {
        return false;
      }
      return matchesSearch(item, term);
    });
  }, [allItems, projectFilter, search, showSubtasks, statusFilter]);

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
            {hasProjectAccess ? (
              <Link href={workItemHref(record)}>
                <Button type="link" className="!px-0">
                  View task
                </Button>
              </Link>
            ) : null}
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
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <ListSearchInput
            live
            placeholder="Search task, discipline, subtask, project…"
            className="w-full max-w-xs"
            committedValue={search}
            onCommit={setSearch}
          />
          {!projectId ? (
            <Select
              allowClear
              showSearch
              placeholder="Project"
              className="w-full min-w-[160px] sm:w-48"
              options={projectOptions}
              value={projectFilter}
              onChange={(value: string | undefined) => setProjectFilter(value)}
              optionFilterProp="label"
            />
          ) : null}
          <Select
            allowClear
            placeholder="Status"
            className="w-full min-w-[140px] sm:w-40"
            options={STATUS_FILTER_OPTIONS}
            value={statusFilter}
            onChange={(value: DesignPackageProjectedStatus | undefined) =>
              setStatusFilter(value)
            }
          />
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs text-slate-600">
          <Switch
            size="small"
            checked={showSubtasks}
            onChange={setShowSubtasks}
          />
          Show subtasks
        </label>
      </div>

      <DataTable<MyWorkItem>
        rowKey={(record) =>
          record.designPackageId
            ? `subtask-${record.designPackageId}`
            : `lead-${record.taskDisciplineId}`
        }
        size="middle"
        columns={columns}
        dataSource={filteredItems}
        scroll={{ x: 960 }}
        locale={{ emptyText: t('empty.noAssignedWork') }}
        onRow={(record) => ({
          className:
            record.kind === 'DISCIPLINE_LEAD'
              ? 'my-work-lead-row border-l-4 !border-l-[#3b82f6]'
              : 'my-work-subtask-row border-l-4 !border-l-amber-400 bg-[#fffbeb]/40',
        })}
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
