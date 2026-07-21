'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Select, Switch } from 'antd';
import { CheckSquare } from 'lucide-react';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import DesignPackageBuilder from '@/components/modules/projects/design-packages/DesignPackageBuilder';
import type {
  DesignPackageProjectedStatus,
  MyWorkItem,
} from '@/lib/api/epc.types';
import { useMyWork } from '@/lib/query/epc-workspace';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  useCanViewMyWork,
  usePermissionsLoading,
} from '@/hooks/use-pm-capabilities';
import { layout } from '@/lib/theme/layout';
import MyWorkDisciplineGroup from './MyWorkDisciplineGroup';
import MyWorkSubtaskRow from './MyWorkSubtaskRow';
import {
  KIND_LABELS,
  KIND_VARIANTS,
  STATUS_FILTER_OPTIONS,
  compareWorkItems,
  matchesSearch,
  projectLabel,
  workItemHref,
} from './my-work-helpers';

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

  const groupedData = useMemo(() => {
    const term = search.trim().toLowerCase();

    const projectFiltered = projectFilter
      ? allItems.filter((item) => item.projectId === projectFilter)
      : allItems;

    const responsiblePersonItems = projectFiltered
      .filter((item) => item.kind === 'RESPONSIBLE_PERSON')
      .filter((item) => matchesSearch(item, term))
      .sort(compareWorkItems);

    const disciplineLeadItems = projectFiltered.filter(
      (item) => item.kind === 'DISCIPLINE_LEAD',
    );

    const subtaskItemsAll = projectFiltered
      .filter((item) => item.kind === 'SUBTASK_ROLE')
      .filter((item) => !statusFilter || item.projectedStatus === statusFilter);

    const subtasksByDiscipline = new Map<string, MyWorkItem[]>();
    for (const item of subtaskItemsAll) {
      const key = item.taskDisciplineId;
      const bucket = subtasksByDiscipline.get(key);
      if (bucket) {
        bucket.push(item);
      } else {
        subtasksByDiscipline.set(key, [item]);
      }
    }

    const ledDisciplineIds = new Set(
      disciplineLeadItems.map((item) => item.taskDisciplineId),
    );

    const disciplineGroups = disciplineLeadItems
      .map((lead) => {
        const leadMatches = matchesSearch(lead, term);
        const allSubtasks = subtasksByDiscipline.get(lead.taskDisciplineId) ?? [];
        const subtasks = (
          term ? allSubtasks.filter((s) => leadMatches || matchesSearch(s, term)) : allSubtasks
        ).sort(compareWorkItems);
        return { lead, subtasks, leadMatches };
      })
      .filter(({ leadMatches, subtasks }) => {
        if (term && !leadMatches && subtasks.length === 0) {
          return false;
        }
        if (statusFilter && subtasks.length === 0) {
          return false;
        }
        return true;
      })
      .sort((a, b) => compareWorkItems(a.lead, b.lead));

    const orphanSubtasks = subtaskItemsAll
      .filter((item) => !ledDisciplineIds.has(item.taskDisciplineId))
      .filter((item) => matchesSearch(item, term))
      .sort(compareWorkItems);

    return { responsiblePersonItems, disciplineGroups, orphanSubtasks };
  }, [allItems, projectFilter, search, statusFilter]);

  useEffect(() => {
    setProjectFilter(undefined);
  }, [projectId]);

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

  const activeItem = workQuery.data?.find(
    (item) => item.taskDisciplineId === addSubtaskFor,
  );

  const isEmpty =
    groupedData.responsiblePersonItems.length === 0 &&
    groupedData.disciplineGroups.length === 0 &&
    groupedData.orphanSubtasks.length === 0;

  return (
    <FormLayout
      title={t('pages.myWork.title')}
      description="Tasks you lead and subtasks where you hold a role."
    >
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <ListSearchInput
            live
            placeholder="Search task, project, discipline, subtask…"
            className={layout.filterControl}
            committedValue={search}
            onCommit={setSearch}
          />
          {!projectId ? (
            <Select
              allowClear
              showSearch
              placeholder="Project"
              className={layout.filterControlSm}
              options={projectOptions}
              value={projectFilter}
              onChange={(value: string | undefined) => setProjectFilter(value)}
              optionFilterProp="label"
            />
          ) : null}
          <Select
            allowClear
            placeholder="Status"
            className={layout.filterControlSm}
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
          Show all subtasks
        </label>
      </div>

      {isEmpty ? (
        <TableEmptyState
          icon={<CheckSquare />}
          title="No work assigned to you yet."
        />
      ) : (
        <div className="flex flex-col gap-6">
          {groupedData.responsiblePersonItems.length > 0 ? (
            <section>
              <h3 className="mb-2 text-sm font-medium text-slate-600">
                Responsible tasks
              </h3>
              <div className="divide-y divide-[var(--color-border-tertiary)] overflow-hidden rounded-[12px] border border-[var(--color-border-tertiary)] bg-white">
                {groupedData.responsiblePersonItems.map((item) => (
                  <div
                    key={item.taskId}
                    className="flex flex-wrap items-center gap-3 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-900">
                        {item.taskName}
                      </div>
                      <div className="text-xs text-slate-500">
                        {(item.overseasTaskNumber ?? item.taskIdCode) || '—'}
                        {' · '}
                        {projectLabel(item)}
                      </div>
                    </div>
                    <StatusBadge
                      label={KIND_LABELS.RESPONSIBLE_PERSON}
                      variant={KIND_VARIANTS.RESPONSIBLE_PERSON}
                    />
                    <Link href={workItemHref(item)}>
                      <Button type="link" className="!px-0" size="small">
                        Open
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {groupedData.disciplineGroups.map(({ lead, subtasks }) => (
            <MyWorkDisciplineGroup
              key={`${lead.taskDisciplineId}:${showSubtasks}`}
              lead={lead}
              subtasks={subtasks}
              defaultExpanded={showSubtasks}
              onAddSubtask={setAddSubtaskFor}
            />
          ))}

          {groupedData.orphanSubtasks.length > 0 ? (
            <section>
              <h3 className="mb-2 text-sm font-medium text-slate-600">
                Other subtasks
              </h3>
              <div className="divide-y divide-[var(--color-border-tertiary)] overflow-hidden rounded-[12px] border border-[var(--color-border-tertiary)] bg-white">
                {groupedData.orphanSubtasks.map((item) => (
                  <MyWorkSubtaskRow
                    key={item.designPackageId ?? `${item.taskDisciplineId}-${item.subtaskId}`}
                    item={item}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}

      {addSubtaskFor && activeItem ? (
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
      ) : null}
    </FormLayout>
  );
}
