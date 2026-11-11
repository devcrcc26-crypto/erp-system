'use client';

import { useDroppable } from '@dnd-kit/core';
import type { Project, ProjectDashboardStats, ProjectStatus } from '@/lib/api/project-management.types';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import {
  formatProjectStatus,
  projectStatusVariant,
} from '@/lib/utils/project-display';
import { tokens } from '@/lib/theme/tokens';
import ProjectKanbanCard from '@/components/modules/projects/ProjectKanbanCard';

export default function KanbanColumn({
  status,
  projects,
  projectStats = {},
  dragEnabled,
}: {
  status: ProjectStatus;
  projects: Project[];
  projectStats?: Record<string, ProjectDashboardStats | undefined>;
  dragEnabled: boolean;
}): React.ReactNode {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
  });

  return (
    <div
      className="flex h-full min-h-[420px] w-[280px] shrink-0 flex-col rounded-md border border-slate-200 bg-slate-50"
      style={{
        backgroundColor: isOver ? tokens.colorPrimaryLight : '#f8fafc',
      }}
    >
      <div className="border-b border-slate-200 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <StatusBadge
            label={formatProjectStatus(status)}
            variant={projectStatusVariant(status)}
          />
          <span className="text-xs font-medium text-slate-500">
            {projects.length}
          </span>
        </div>
      </div>

      <div
        ref={setNodeRef}
        className="flex flex-1 flex-col gap-3 overflow-y-auto p-3"
      >
        {projects.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-400">
            Drop projects here
          </p>
        ) : (
          projects.map((project) => (
            <ProjectKanbanCard
              key={project.id}
              project={project}
              responsiblePersonName={project.responsiblePersonName ?? undefined}
              stats={projectStats[project.id]}
              dragEnabled={dragEnabled}
            />
          ))
        )}
      </div>
    </div>
  );
}
