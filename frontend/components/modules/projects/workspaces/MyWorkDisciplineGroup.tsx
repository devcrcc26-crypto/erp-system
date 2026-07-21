'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from 'antd';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { MyWorkItem } from '@/lib/api/epc.types';
import { formatDisciplineLabel } from '@/lib/utils/discipline-display';
import MyWorkSubtaskRow from './MyWorkSubtaskRow';
import { projectLabel, workItemHref } from './my-work-helpers';

/**
 * A discipline the user leads, collapsed/expanded, with its subtasks nested inside.
 */
export default function MyWorkDisciplineGroup({
  lead,
  subtasks,
  defaultExpanded,
  onAddSubtask,
}: {
  lead: MyWorkItem;
  subtasks: MyWorkItem[];
  defaultExpanded: boolean;
  onAddSubtask: (taskDisciplineId: string) => void;
}): React.ReactNode {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const taskCode = lead.overseasTaskNumber ?? lead.taskIdCode;

  return (
    <div className="overflow-hidden rounded-[12px] border border-[var(--color-border-tertiary)] bg-white">
      <div
        role="button"
        tabIndex={0}
        className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-4 py-3 cursor-pointer"
        onClick={() => setExpanded((prev) => !prev)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setExpanded((prev) => !prev);
          }
        }}
      >
        <div className="flex min-w-0 items-center gap-3">
          {expanded ? (
            <ChevronDown size={16} className="shrink-0 text-slate-400" />
          ) : (
            <ChevronRight size={16} className="shrink-0 text-slate-400" />
          )}
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-900">
              {formatDisciplineLabel(lead.disciplineIndex)} — {lead.disciplineName}
            </div>
            <div className="truncate text-xs text-slate-500">
              {lead.taskName}
              {taskCode ? ` (${taskCode})` : ''}
              {' · '}
              {projectLabel(lead)}
            </div>
          </div>
        </div>

        <div
          className="flex shrink-0 items-center gap-3"
          onClick={(event) => event.stopPropagation()}
        >
          <span className="text-xs text-slate-500">
            {subtasks.length} subtask{subtasks.length === 1 ? '' : 's'}
          </span>
          <Link href={workItemHref(lead)}>
            <Button size="small">Open</Button>
          </Link>
          <Button size="small" onClick={() => onAddSubtask(lead.taskDisciplineId)}>
            Add subtask
          </Button>
        </div>
      </div>

      {expanded ? (
        <div className="divide-y divide-[var(--color-border-tertiary)]">
          {subtasks.length === 0 ? (
            <div className="px-6 py-4 text-sm italic text-slate-500">
              No subtasks yet.
            </div>
          ) : (
            subtasks.map((item) => (
              <MyWorkSubtaskRow
                key={item.designPackageId ?? `${item.taskDisciplineId}-${item.subtaskId}`}
                item={item}
                indented
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
