'use client';

import Link from 'next/link';
import type { MouseEvent } from 'react';
import { Avatar, Progress, Typography } from 'antd';
import { CalendarOutlined, UserOutlined } from '@ant-design/icons';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import Card from '@/components/ui/Card/Card';
import type { Project, ProjectDashboardStats } from '@/lib/api/project-management.types';
import { formatProjectDate } from '@/lib/utils/project-display';
import { tokens } from '@/lib/theme/tokens';

export default function ProjectKanbanCard({
  project,
  projectManagerName,
  stats,
  isDragging = false,
  dragEnabled = true,
}: {
  project: Project;
  projectManagerName?: string;
  stats?: ProjectDashboardStats;
  isDragging?: boolean;
  dragEnabled?: boolean;
}): React.ReactNode {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: project.id,
    data: { project },
    disabled: !dragEnabled,
  });

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
      }
    : undefined;

  const progressPct = stats?.actualProgressPct ?? null;

  const cardBody = (
  <>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/projects/${project.id}`}
            className="text-sm font-semibold text-orange-600 hover:text-orange-700"
            onClick={(event: MouseEvent<HTMLAnchorElement>) =>
              event.stopPropagation()
            }
          >
            {project.projectCode}
          </Link>
          <Typography.Paragraph
            className="!mb-0 !mt-1 text-sm font-medium text-slate-900"
            ellipsis={{ rows: 2 }}
          >
            {project.name}
          </Typography.Paragraph>
        </div>
      </div>

      <div className="space-y-2 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <UserOutlined />
          <span className="truncate">
            {projectManagerName ?? 'Unassigned'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <CalendarOutlined />
          <span>{formatProjectDate(project.plannedFinishDate)}</span>
        </div>
      </div>

      {progressPct != null && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs text-slate-500">
            <span>Progress</span>
            <span>{progressPct}%</span>
          </div>
          <Progress
            percent={progressPct}
            showInfo={false}
            strokeColor={tokens.colorPrimary}
            size="small"
          />
        </div>
      )}

      <div className="mt-3 flex gap-3 text-xs">
        <span className="rounded-full bg-orange-50 px-2 py-0.5 text-orange-700">
          RFIs {stats?.openRfis ?? '—'}
        </span>
        <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700">
          Issues {stats?.openIssues ?? '—'}
        </span>
      </div>
    </>
  );

  if (isDragging) {
    return (
      <Card
        size="small"
        variant="borderless"
        className="shadow-md"
        style={{ borderRadius: tokens.borderRadius, opacity: 0.95 }}
      >
        {cardBody}
      </Card>
    );
  }

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <Card
        size="small"
        variant="borderless"
        className={`shadow-sm transition-shadow hover:shadow-md ${
          dragEnabled ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
        style={{ borderRadius: tokens.borderRadius }}
      >
        {cardBody}
      </Card>
    </div>
  );
}

export function ProjectKanbanCardPreview({
  project,
  projectManagerName,
  stats,
}: {
  project: Project;
  projectManagerName?: string;
  stats?: ProjectDashboardStats;
}): React.ReactNode {
  return (
    <ProjectKanbanCard
      project={project}
      projectManagerName={projectManagerName}
      stats={stats}
      isDragging
      dragEnabled={false}
    />
  );
}

export function ProjectManagerAvatar({
  name,
}: {
  name?: string;
}): React.ReactNode {
  const initial = name?.charAt(0)?.toUpperCase() ?? '?';
  return (
    <Avatar size="small" style={{ backgroundColor: tokens.colorNavy }}>
      {initial}
    </Avatar>
  );
}
