'use client';

import Link from 'next/link';
import { Button } from 'antd';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import ApprovedCrRevisionBanner from '@/components/modules/projects/change-requests/ApprovedCrRevisionBanner';
import type { MyWorkItem } from '@/lib/api/epc.types';
import { formatDisciplineNumber } from '@/lib/utils/discipline-display';
import { formatFullSubtaskCode } from '@/lib/utils/submittal-display';
import { subtaskStatusDisplay, workItemHref } from './my-work-helpers';

/**
 * One subtask (design package) table row - used both nested under a
 * MyWorkDisciplineGroup and standalone in the "Other subtasks" section.
 */
export default function MyWorkSubtaskRow({
  item,
  indented = false,
}: {
  item: MyWorkItem;
  indented?: boolean;
}): React.ReactNode {
  const status = subtaskStatusDisplay(item);
  const fullCode = formatFullSubtaskCode({
    overseasTaskNumber: item.overseasTaskNumber,
    disciplineIndex: item.disciplineIndex,
    subtaskIndex: item.subtaskIndex,
    packageCode: item.packageCode,
  });
  const subCode = [fullCode, item.subtaskId].filter(Boolean).join(' · ');
  const indentClass = indented ? 'pl-10' : 'pl-4';

  return (
    <>
      <tr className="border-t border-[var(--color-border-tertiary)] hover:bg-slate-50">
        <td className={`px-4 py-3 ${indentClass}`}>
          <div className="text-sm font-medium text-slate-900">
            {item.subtaskName ?? '-'}
          </div>
          <div className="text-xs text-slate-500">{subCode || '-'}</div>
        </td>
        <td className="px-4 py-3 text-sm text-slate-700">{item.projectName}</td>
        <td className="px-4 py-3 text-sm text-slate-500">
          {item.overseasTaskNumber ?? item.taskIdCode ?? '-'}
        </td>
        <td className="px-4 py-3 text-sm text-slate-500">
          {item.disciplineName}
          {item.disciplineIndex != null
            ? ` (${formatDisciplineNumber(item.disciplineIndex)})`
            : ''}
        </td>
        <td className="px-4 py-3 text-sm text-slate-700">
          {item.roleLabel ?? '-'}
        </td>
        <td className="px-4 py-3">
          {status ? (
            <StatusBadge label={status.label} variant={status.variant} />
          ) : (
            <span className="text-xs text-slate-400">-</span>
          )}
        </td>
        <td className="px-4 py-3 text-right">
          <Link href={workItemHref(item)}>
            <Button size="small">Open</Button>
          </Link>
        </td>
      </tr>

      {item.designPackageId ? (
        <tr>
          <td colSpan={7} className={`px-4 pb-2 ${indentClass}`}>
            <ApprovedCrRevisionBanner
              projectId={item.projectId}
              designPackageId={item.designPackageId}
              packageStatus={item.packageStatus}
              embedDrawer
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}
