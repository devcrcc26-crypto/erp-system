// UI polish pass - styles only, no logic changes

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
import { layout } from '@/lib/theme/layout';
import { tokens } from '@/lib/theme/tokens';

export default function ProjectKanbanCard({
  project,
  responsiblePersonName,
  stats,
  isDragging = false,
  dragEnabled = true,
}: {
  project: Project;
  responsiblePersonName?: string;
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
            className={`${layout.traceabilityLinkClass} no-underline hover:underline`}
            style={{ color: tokens.colorTeal600 }}
            onClick={(event: MouseEvent<HTMLAnchorElement>) =>
              event.stopPropagation()
            }
          >
            {project.projectCode}
          </Link>
          <Typography.Paragraph
            className="!mb-0 !mt-1 text-[13px] font-medium"
            style={{ color: tokens.colorTextPrimary }}
            ellipsis={{ rows: 2 }}
          >
            {project.name}
          </Typography.Paragraph>
          {project.nameZh ? (
            <Typography.Paragraph
              className="!mb-0 text-[12px]"
              style={{ color: tokens.colorTextSecondary }}
              ellipsis={{ rows: 1 }}
            >
              {project.nameZh}
            </Typography.Paragraph>
          ) : null}
        </div>
      </div>

      <div
        className="space-y-2 text-[11px]"
        style={{ color: tokens.colorTextTertiary }}
      >
        <div className="flex items-center gap-2">
          <UserOutlined />
          <span className="truncate">
            {responsiblePersonName ?? 'Unassigned'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <CalendarOutlined />
          <span>{formatProjectDate(project.plannedFinishDate)}</span>
        </div>
      </div>

      {progressPct != null && (
        <div className="mt-3">
          <div
            className="mb-1 flex justify-between text-[11px]"
            style={{ color: tokens.colorTextTertiary }}
          >
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

      <div className="mt-3 flex gap-2 text-[10px] font-medium">
        <span
          className="rounded-[10px] px-2 py-0.5"
          style={{
            backgroundColor: tokens.colorTeal50,
            color: tokens.colorTeal600,
          }}
        >
          RFIs {stats?.openRfis ?? '-'}
        </span>
        <span
          className="rounded-[10px] px-2 py-0.5"
          style={{
            backgroundColor: tokens.colorRed50,
            color: tokens.colorRed600,
          }}
        >
          Issues {stats?.openIssues ?? '-'}
        </span>
      </div>
    </>
  );

  const cardStyle = {
    borderRadius: tokens.borderRadiusCard,
    border: `0.5px solid ${tokens.colorBorder}`,
    boxShadow: 'none' as const,
    opacity: isDragging ? 0.95 : 1,
  };

  if (isDragging) {
    return (
      <Card size="small" variant="borderless" style={cardStyle}>
        {cardBody}
      </Card>
    );
  }

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <Card
        size="small"
        variant="borderless"
        className={`transition-colors hover:bg-[var(--color-surface-secondary)] ${
          dragEnabled ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
        style={cardStyle}
      >
        {cardBody}
      </Card>
    </div>
  );
}

export function ProjectKanbanCardPreview({
  project,
  responsiblePersonName,
  stats,
}: {
  project: Project;
  responsiblePersonName?: string;
  stats?: ProjectDashboardStats;
}): React.ReactNode {
  return (
    <ProjectKanbanCard
      project={project}
      responsiblePersonName={responsiblePersonName}
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
    <Avatar
      size="small"
      style={{
        backgroundColor: tokens.colorBlue50,
        color: tokens.colorBlue800,
        fontWeight: 500,
        fontSize: 11,
      }}
    >
      {initial}
    </Avatar>
  );
}
