// Gap completion — new

'use client';

import Link from 'next/link';
import { Button } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  RightOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import Card from '@/components/ui/Card/Card';
import TableEmptyState from '@/components/ui/TableEmptyState';
import {
  useDispatcherWorkload,
  useProjectReviewSessions,
} from '@/lib/query/epc-workspace';
import {
  useProcessRevisionTrigger,
  useRevisionTriggers,
} from '@/lib/query/revision-triggers';
import type {
  ExternalReviewTrigger,
  ReviewSessionSummary,
} from '@/lib/api/project-management.types';
import type { DispatcherWorkloadItem } from '@/lib/api/epc.types';
import { tokens } from '@/lib/theme/tokens';
import {
  reviewTierColors,
  reviewTierLabel,
} from '@/lib/utils/review-tier-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';

function slaDeadlineStyle(
  session: ReviewSessionSummary,
): { color: string; showOverdue: boolean; showWarning: boolean } {
  if (session.slaOverdue) {
    return { color: tokens.colorRed600, showOverdue: true, showWarning: false };
  }
  if (!session.slaDeadlineAt) {
    return { color: tokens.colorTextSecondary, showOverdue: false, showWarning: false };
  }
  const hours =
    (new Date(session.slaDeadlineAt).getTime() - Date.now()) / 3_600_000;
  if (hours > 0 && hours <= 24) {
    return { color: tokens.colorAmber400, showOverdue: false, showWarning: true };
  }
  return { color: tokens.colorTextSecondary, showOverdue: false, showWarning: false };
}

function triggerPillStyle(type: string): { bg: string; text: string } {
  if (type === 'RFI') {
    return { bg: tokens.colorBlue50, text: tokens.colorBlue400 };
  }
  if (type === 'CHANGE_REQUEST') {
    return { bg: tokens.colorAmber50, text: tokens.colorAmber400 };
  }
  return { bg: tokens.colorTeal50, text: tokens.colorTeal600 };
}

export default function EpcWorkspacePanels({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const messageApi = useAppMessage();
  const sessionsQuery = useProjectReviewSessions(projectId, 'ACTIVE');
  const triggersQuery = useRevisionTriggers(projectId, 'PENDING', {
    page: 1,
    limit: 20,
  });
  const workloadQuery = useDispatcherWorkload(projectId);
  const processTrigger = useProcessRevisionTrigger();

  const sessions = sessionsQuery.data?.data ?? [];
  const triggers = triggersQuery.data?.data ?? [];
  const workload = workloadQuery.data ?? [];

  async function handleProcessTrigger(trigger: ExternalReviewTrigger): Promise<void> {
    try {
      await processTrigger.mutateAsync({
        projectId,
        triggerId: trigger.id,
      });
      messageApi.success('Revision trigger processed');
      void triggersQuery.refetch();
      void sessionsQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to process trigger', messageApi);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <PanelCard title="Active reviews">
        {sessions.length === 0 ? (
          <TableEmptyState
            icon={<CheckCircleOutlined style={{ color: tokens.colorGreen600 }} />}
            title="No active review sessions"
            description="All review sessions are complete"
          />
        ) : (
          <ul className="divide-y" style={{ borderColor: tokens.colorBorder }}>
            {sessions.map((session) => {
              const tierStyle = reviewTierColors(session.currentTier);
              const sla = slaDeadlineStyle(session);
              return (
                <li key={session.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-[13px] font-medium"
                      style={{ color: tokens.colorTextPrimary }}
                    >
                      {session.designPackageName}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{
                          backgroundColor: tierStyle.bg,
                          color: tierStyle.text,
                        }}
                      >
                        {reviewTierLabel(session.currentTier)}
                      </span>
                      <span
                        className="text-[12px]"
                        style={{ color: tokens.colorTextSecondary }}
                      >
                        {session.assigneeName ?? 'Unassigned'}
                      </span>
                    </div>
                    <div
                      className="mt-1 flex items-center gap-1 text-[12px]"
                      style={{ color: sla.color }}
                    >
                      {(sla.showOverdue || sla.showWarning) && (
                        <ClockCircleOutlined className="text-[11px]" />
                      )}
                      {sla.showOverdue && <span>Overdue · </span>}
                      {formatProjectDate(session.slaDeadlineAt)}
                    </div>
                  </div>
                  <Link
                    href={`/projects/${projectId}/disciplines/${session.taskDisciplineId}/packages/${session.designPackageId}`}
                    className="shrink-0"
                    style={{ color: tokens.colorTextTertiary }}
                  >
                    <RightOutlined />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </PanelCard>

      <PanelCard title="Pending revision triggers">
        {triggers.length === 0 ? (
          <TableEmptyState
            icon={<CheckCircleOutlined style={{ color: tokens.colorGreen600 }} />}
            title="No pending revision triggers"
            description="All external triggers have been processed"
          />
        ) : (
          <ul className="divide-y" style={{ borderColor: tokens.colorBorder }}>
            {triggers.map((trigger) => {
              const pill = triggerPillStyle(trigger.triggerType);
              return (
                <li
                  key={trigger.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{ backgroundColor: pill.bg, color: pill.text }}
                    >
                      {trigger.triggerType.replace(/_/g, ' ')}
                    </span>
                    <p
                      className="mt-1 font-mono text-[12px]"
                      style={{ color: tokens.colorTextPrimary }}
                    >
                      {trigger.sourceEntityId}
                    </p>
                    <p
                      className="text-[10px]"
                      style={{ color: tokens.colorTextTertiary }}
                    >
                      {formatProjectDate(trigger.createdAt)}
                    </p>
                  </div>
                  <Button
                    size="small"
                    type="primary"
                    loading={processTrigger.isPending}
                    onClick={() => void handleProcessTrigger(trigger)}
                  >
                    Process
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </PanelCard>

      <PanelCard title="Workload" className="lg:col-span-2">
        {workload.length === 0 ? (
          <TableEmptyState
            icon={<CheckCircleOutlined style={{ color: tokens.colorGreen600 }} />}
            title="No bottlenecks detected"
            description="Reviewer load is within normal limits"
          />
        ) : (
          <ul className="divide-y" style={{ borderColor: tokens.colorBorder }}>
            {workload.map((row: DispatcherWorkloadItem) => {
              const bottleneck = row.slaOverdue > 0 || row.openComments > 5;
              return (
                <li
                  key={row.userId}
                  className="flex items-center gap-3 py-3"
                  style={
                    bottleneck
                      ? { backgroundColor: tokens.colorCoral50 }
                      : undefined
                  }
                >
                  {bottleneck && (
                    <WarningOutlined style={{ color: tokens.colorCoral400 }} />
                  )}
                  <div className="flex flex-1 items-center justify-between gap-4">
                    <div>
                      <p
                        className="text-[13px] font-medium"
                        style={{ color: tokens.colorTextPrimary }}
                      >
                        {row.displayName}
                      </p>
                      <p
                        className="text-[12px]"
                        style={{ color: tokens.colorTextSecondary }}
                      >
                        Reviewer
                      </p>
                    </div>
                    <div className="text-right text-[12px] tabular-nums">
                      <p>{row.assignedReviewSessions} active sessions</p>
                      <p style={{ color: tokens.colorTextSecondary }}>
                        {row.openComments} open comments
                        {row.slaOverdue > 0 ? ` · ${row.slaOverdue} overdue` : ''}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </PanelCard>
    </div>
  );
}

function PanelCard({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}): React.ReactNode {
  return (
    <Card
      className={className}
      size="small"
      title={
        <span
          className="text-[13px] font-medium"
          style={{ color: tokens.colorTextPrimary }}
        >
          {title}
        </span>
      }
      styles={{
        header: {
          padding: '14px 18px',
          borderBottom: `0.5px solid ${tokens.colorBorder}`,
          minHeight: 'auto',
        },
        body: { padding: '8px 18px 16px' },
      }}
      style={{
        borderRadius: 12,
        border: `0.5px solid ${tokens.colorBorder}`,
        boxShadow: 'none',
      }}
    >
      {children}
    </Card>
  );
}
