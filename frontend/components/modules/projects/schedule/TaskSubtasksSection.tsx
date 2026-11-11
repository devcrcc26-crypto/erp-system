'use client';

import Link from 'next/link';
import { Button } from 'antd';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import ScheduleSubtaskStatusBadge from '@/components/modules/projects/schedule/ScheduleSubtaskStatusBadge';
import type { ScheduleSubtaskEntry } from '@/lib/query/schedule';
import {
  getScheduleSubtaskDisplayStatus,
  scheduleSubtaskWorkspaceHref,
} from '@/lib/utils/schedule-subtasks';
import { tokens } from '@/lib/theme/tokens';

export default function TaskSubtasksSection({
  projectId,
  subtasks,
  loading,
}: {
  projectId: string;
  subtasks: ScheduleSubtaskEntry[];
  loading?: boolean;
}): React.ReactNode {
  if (loading) {
    return (
      <FormLayout title="Subtasks">
        <div className="space-y-2 py-2">
          <div className="erp-page-skeleton h-12 w-full rounded" />
          <div className="erp-page-skeleton h-12 w-full rounded" />
        </div>
      </FormLayout>
    );
  }

  if (subtasks.length === 0) {
    return (
      <FormLayout title="Subtasks">
        <p
          className="text-[13px]"
          style={{ color: tokens.colorTextSecondary }}
        >
          No subtasks linked to this task yet.
        </p>
      </FormLayout>
    );
  }

  return (
    <FormLayout title="Subtasks">
      <ul className="space-y-3">
        {subtasks.map((entry) => {
          const displayStatus = getScheduleSubtaskDisplayStatus(entry.package);
          const workspaceHref = scheduleSubtaskWorkspaceHref(
            projectId,
            entry.taskDisciplineId,
            entry.package.id,
          );

          return (
            <li
              key={entry.package.id}
              className="rounded-lg border px-4 py-3"
              style={{ borderColor: tokens.colorBorder }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge label="Subtask" variant="orange" />
                    <span className="font-mono text-[11px] text-slate-500">
                      {entry.package.packageCode}
                    </span>
                    <span className="text-[14px] font-medium">
                      {entry.package.name}
                    </span>
                    <ScheduleSubtaskStatusBadge status={displayStatus} />
                  </div>
                  <p
                    className="mt-1 text-[12px]"
                    style={{ color: tokens.colorTextSecondary }}
                  >
                    {entry.disciplineName}
                  </p>
                  <p
                    className="mt-1 text-[12px]"
                    style={{ color: tokens.colorTextTertiary }}
                  >
                    {entry.documentCount}{' '}
                    {entry.documentCount === 1 ? 'document' : 'documents'}
                  </p>
                </div>
                <Link href={workspaceHref}>
                  <Button type="link" className="!px-0">
                    Open in EPC Workspace
                  </Button>
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </FormLayout>
  );
}
