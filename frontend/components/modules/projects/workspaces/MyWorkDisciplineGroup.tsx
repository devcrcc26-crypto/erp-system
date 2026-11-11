'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from 'antd';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { MyWorkItem } from '@/lib/api/epc.types';
import { formatDisciplineNumber } from '@/lib/utils/discipline-display';
import MyWorkSubtaskRow from './MyWorkSubtaskRow';
import { workItemHref } from './my-work-helpers';

const TOTAL_COLUMNS = 7;

/**
 * A discipline the user leads, rendered as a header <tr> (spanning the
 * table) followed by its subtasks' <tr>s, collapsible independently.
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
    <>
      <tr
        className="cursor-pointer border-t-2 border-[var(--color-border-tertiary)] bg-slate-50 hover:bg-slate-100"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <td colSpan={5} className="px-4 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-label={expanded ? 'Collapse discipline' : 'Expand discipline'}
              className="flex shrink-0 items-center justify-center text-slate-400"
              onClick={(event) => {
                event.stopPropagation();
                setExpanded((prev) => !prev);
              }}
            >
              {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
            <span className="text-sm font-semibold text-slate-900">
              {lead.disciplineName}
            </span>
            <span className="text-xs text-slate-500">
              {taskCode}
              {lead.disciplineIndex != null
                ? ` · Disc ${formatDisciplineNumber(lead.disciplineIndex)}`
                : ''}
              {' · '}
              {lead.projectName}
            </span>
            <span className="ml-2 text-xs text-slate-500">
              ({subtasks.length} subtask{subtasks.length === 1 ? '' : 's'})
            </span>
          </div>
        </td>
        <td className="px-4 py-2 text-right" colSpan={2}>
          <div
            className="flex items-center justify-end gap-2"
            onClick={(event) => event.stopPropagation()}
          >
            <Link href={workItemHref(lead)}>
              <Button size="small">Open</Button>
            </Link>
            <Button size="small" onClick={() => onAddSubtask(lead.taskDisciplineId)}>
              Add subtask
            </Button>
          </div>
        </td>
      </tr>

      {expanded ? (
        subtasks.length === 0 ? (
          <tr>
            <td
              colSpan={TOTAL_COLUMNS}
              className="border-t border-[var(--color-border-tertiary)] px-4 py-3 pl-10 text-sm italic text-slate-500"
            >
              No subtasks yet.
            </td>
          </tr>
        ) : (
          subtasks.map((item) => (
            <MyWorkSubtaskRow
              key={item.designPackageId ?? `${item.taskDisciplineId}-${item.subtaskId}`}
              item={item}
              indented
            />
          ))
        )
      ) : null}
    </>
  );
}
