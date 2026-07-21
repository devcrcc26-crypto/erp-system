'use client';

import Link from 'next/link';
import { Button } from 'antd';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import ApprovedCrRevisionBanner from '@/components/modules/projects/change-requests/ApprovedCrRevisionBanner';
import type { MyWorkItem } from '@/lib/api/epc.types';
import { subtaskStatusDisplay, workItemHref } from './my-work-helpers';

/**
 * One subtask (design package) row — used both nested under a DisciplineGroup
 * and standalone in the "Other subtasks" section.
 */
export default function MyWorkSubtaskRow({
  item,
  indented = false,
}: {
  item: MyWorkItem;
  indented?: boolean;
}): React.ReactNode {
  const status = subtaskStatusDisplay(item);
  const subCode = [item.packageCode, item.subtaskId].filter(Boolean).join(' · ');

  return (
    <div className="bg-white">
      <div
        className={`flex flex-wrap items-center gap-3 px-4 py-3 ${indented ? 'pl-10' : ''}`}
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-slate-900">
            {item.subtaskName ?? '—'}
          </div>
          <div className="text-xs text-slate-500">{subCode || '—'}</div>
        </div>

        <div className="w-44 shrink-0 text-xs text-slate-600">
          {item.roleLabel ?? '—'}
        </div>

        <div className="w-28 shrink-0">
          {status ? (
            <StatusBadge label={status.label} variant={status.variant} />
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )}
        </div>

        <Link href={workItemHref(item)} className="shrink-0">
          <Button type="link" className="!px-0" size="small">
            Open
          </Button>
        </Link>
      </div>

      {item.designPackageId ? (
        <div className={`px-4 pb-3 ${indented ? 'pl-10' : ''}`}>
          <ApprovedCrRevisionBanner
            projectId={item.projectId}
            designPackageId={item.designPackageId}
            packageStatus={item.packageStatus}
            embedDrawer
          />
        </div>
      ) : null}
    </div>
  );
}
