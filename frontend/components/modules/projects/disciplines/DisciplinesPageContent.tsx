'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Alert, Select } from 'antd';
import { Package } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import TableEmptyState from '@/components/ui/TableEmptyState';
import ScheduleSubtaskStatusBadge from '@/components/modules/projects/schedule/ScheduleSubtaskStatusBadge';
import { ApiRequestError } from '@/lib/api/errors';
import type { DesignPackage } from '@/lib/api/epc.types';
import { useProjectDisciplines } from '@/lib/query/disciplines';
import { useEngineeringDisciplineOptions } from '@/lib/query/org';
import { useProject } from '@/lib/query/projects';
import { useScheduleSubtasks, useTasks } from '@/lib/query/schedule';
import { useRoleLens } from '@/components/modules/projects/workspaces/RoleLensProvider';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { layout } from '@/lib/theme/layout';
import { tokens } from '@/lib/theme/tokens';
import ProjectModuleGate from '@/components/modules/projects/ProjectModuleGate';
import {
  getScheduleSubtaskDisplayStatus,
  scheduleSubtaskWorkspaceHref,
  type ScheduleSubtaskDisplayStatus,
} from '@/lib/utils/schedule-subtasks';
import { formatLocalizedName } from '@/lib/utils/bilingual-name';
import { formatDisciplineLabel } from '@/lib/utils/discipline-display';

interface SubtaskTableRow {
  id: string;
  name: string;
  disciplineIndex: number | null;
  disciplineCatalogId: string | null;
  taskId: string;
  taskName: string;
  taskDisciplineId: string;
  projectId: string;
  projectName: string;
  status: ScheduleSubtaskDisplayStatus;
  dueDate: string | null;
  package: DesignPackage;
}

export default function DisciplinesPageContent({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const lens = useRoleLens();
  const permLoading = usePermissionsLoading();
  const { t } = useEpcTranslation();
  const [search, setSearch] = useState('');
  const [disciplineFilter, setDisciplineFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<
    ScheduleSubtaskDisplayStatus | undefined
  >();

  const projectQuery = useProject(projectId, Boolean(projectId));
  const disciplinesQuery = useProjectDisciplines(
    projectId,
    !permLoading && lens.canViewEngineering,
  );
  const subtasksQuery = useScheduleSubtasks(
    projectId,
    !permLoading && lens.canViewEngineering,
  );
  const tasksQuery = useTasks(
    projectId,
    { page: 1, limit: 100 },
    !permLoading && lens.canViewEngineering,
  );
  const disciplineOptionsQuery = useEngineeringDisciplineOptions(
    true,
    !permLoading && lens.canViewEngineering,
  );

  const apiUnavailable =
    disciplinesQuery.isError &&
    disciplinesQuery.error instanceof ApiRequestError &&
    (disciplinesQuery.error.status === 404 ||
      disciplinesQuery.error.status === 0 ||
      disciplinesQuery.error.status === 429);

  const projectName = projectQuery.data
    ? formatLocalizedName(projectQuery.data)
    : 'Project';

  const taskNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of tasksQuery.data?.data ?? []) {
      map.set(task.id, task.name);
    }
    for (const discipline of subtasksQuery.disciplines) {
      map.set(discipline.taskId, discipline.taskName);
    }
    return map;
  }, [subtasksQuery.disciplines, tasksQuery.data?.data]);

  const taskDueDateById = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const task of tasksQuery.data?.data ?? []) {
      map.set(task.id, task.finishDate);
    }
    return map;
  }, [tasksQuery.data?.data]);

  const disciplineCatalogIdByTaskDisciplineId = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const discipline of subtasksQuery.disciplines) {
      map.set(discipline.id, discipline.disciplineId);
    }
    return map;
  }, [subtasksQuery.disciplines]);

  const disciplineIndexByTaskDisciplineId = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const discipline of subtasksQuery.disciplines) {
      map.set(discipline.id, discipline.disciplineIndex ?? null);
    }
    return map;
  }, [subtasksQuery.disciplines]);

  const rows = useMemo(() => {
    const output: SubtaskTableRow[] = [];
    for (const [taskId, entries] of subtasksQuery.byTaskId) {
      for (const entry of entries) {
        output.push({
          id: entry.package.id,
          name: entry.package.name,
          disciplineIndex:
            disciplineIndexByTaskDisciplineId.get(entry.taskDisciplineId) ??
            null,
          disciplineCatalogId:
            disciplineCatalogIdByTaskDisciplineId.get(entry.taskDisciplineId) ??
            null,
          taskId,
          taskName: taskNameById.get(taskId) ?? '-',
          taskDisciplineId: entry.taskDisciplineId,
          projectId,
          projectName,
          status: getScheduleSubtaskDisplayStatus(entry.package),
          dueDate: taskDueDateById.get(taskId) ?? null,
          package: entry.package,
        });
      }
    }
    return output.sort((left, right) => left.name.localeCompare(right.name));
  }, [
    disciplineCatalogIdByTaskDisciplineId,
    disciplineIndexByTaskDisciplineId,
    projectId,
    projectName,
    subtasksQuery.byTaskId,
    taskDueDateById,
    taskNameById,
  ]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (disciplineFilter && row.disciplineCatalogId !== disciplineFilter) {
        return false;
      }
      if (statusFilter && row.status !== statusFilter) {
        return false;
      }
      if (!term) {
        return true;
      }
      return (
        row.name.toLowerCase().includes(term) ||
        (row.package.subtaskId?.toLowerCase().includes(term) ?? false) ||
        row.package.packageCode.toLowerCase().includes(term)
      );
    });
  }, [disciplineFilter, rows, search, statusFilter]);

  const statusOptions: ScheduleSubtaskDisplayStatus[] = [
    'OPEN',
    'IN REVIEW',
    'APPROVED',
    'LOCKED',
    'CLOSED',
  ];

  const columns: ColumnsType<SubtaskTableRow> = [
    {
      title: 'Nos',
      key: 'subtaskId',
      width: 140,
      ellipsis: true,
      render: (_value, record) => (
        <span className="font-mono text-[11px] text-slate-600">
          {record.package.subtaskId ?? record.package.packageCode}
        </span>
      ),
    },
    {
      title: 'Subtask name',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (name: string, record) => (
        <Link
          href={scheduleSubtaskWorkspaceHref(
            record.projectId,
            record.taskDisciplineId,
            record.id,
          )}
          className={`${layout.traceabilityLinkClass} no-underline hover:underline`}
          style={{ color: tokens.colorTeal600 }}
        >
          {name}
        </Link>
      ),
    },
    {
      title: 'Discipline',
      key: 'disciplineIndex',
      ellipsis: true,
      render: (_value, record) => formatDisciplineLabel(record.disciplineIndex),
    },
    {
      title: 'Task',
      key: 'task',
      ellipsis: true,
      render: (_value, record) => (
        <Link
          href={`/projects/${record.projectId}/schedule/tasks/${record.taskId}`}
          className="text-[12px] text-slate-700 hover:underline"
        >
          {record.taskName}
        </Link>
      ),
    },
    {
      title: 'Project',
      key: 'project',
      ellipsis: true,
      render: (_value, record) => (
        <Link
          href={`/projects/${record.projectId}`}
          className="text-[12px] text-slate-700 hover:underline"
        >
          {record.projectName}
        </Link>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 120,
      render: (_value, record) => (
        <ScheduleSubtaskStatusBadge status={record.status} />
      ),
    },
    {
      title: 'Due date',
      key: 'dueDate',
      width: 110,
      render: (_value, record) => record.dueDate ?? '-',
    },
    {
      title: 'EPC Workspace',
      key: 'workspace',
      width: 130,
      render: (_value, record) => (
        <Link
          href={scheduleSubtaskWorkspaceHref(
            record.projectId,
            record.taskDisciplineId,
            record.id,
          )}
        >
          Open
        </Link>
      ),
    },
  ];

  if (permLoading || disciplinesQuery.isLoading || subtasksQuery.isLoading) {
    return <PageLoadingSkeleton />;
  }

  if (!lens.canViewEngineering) {
    return (
      <Alert type="warning" showIcon title="You do not have access to engineering workspaces." />
    );
  }

  return (
    <ProjectModuleGate projectId={projectId} module="design_packages">
      <FormLayout
        title={t('pages.disciplines.title')}
        description={t('pages.disciplines.description')}
      >
        {apiUnavailable && (
          <Alert
            type="info"
            showIcon
            className="mb-4"
            title="Subtasks API not connected"
            description="Subtask rows appear when the backend is available."
          />
        )}

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <ListSearchInput
            live
            placeholder="Search subtask name…"
            className="w-full max-w-xs"
            committedValue={search}
            onCommit={setSearch}
          />
          <Select
            allowClear
            placeholder="Discipline"
            className="w-full min-w-[160px] sm:w-44"
            loading={disciplineOptionsQuery.isLoading}
            options={disciplineOptionsQuery.options}
            value={disciplineFilter}
            onChange={(value: string | undefined) => setDisciplineFilter(value)}
          />
          <Select
            allowClear
            placeholder="Status"
            className="w-full min-w-[140px] sm:w-40"
            options={statusOptions.map((status) => ({
              value: status,
              label: status,
            }))}
            value={statusFilter}
            onChange={(value: ScheduleSubtaskDisplayStatus | undefined) =>
              setStatusFilter(value)
            }
          />
        </div>

        <DataTable<SubtaskTableRow>
          rowKey="id"
          columns={columns}
          dataSource={filtered}
          loading={subtasksQuery.isSubtasksLoading}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<Package />}
                title="No subtasks"
                description="Subtasks assigned to you on this project will appear here."
              />
            ),
          }}
        />
      </FormLayout>
    </ProjectModuleGate>
  );
}
