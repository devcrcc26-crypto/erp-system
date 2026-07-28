'use client';

import { useRouter } from 'next/navigation';
import { Alert, Button } from 'antd';
import { ArrowLeft } from 'lucide-react';
import MeetingDetailContent from '@/components/modules/projects/meetings/MeetingDetailContent';
import ProjectModuleGate from '@/components/modules/projects/ProjectModuleGate';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { ApiRequestError } from '@/lib/api/errors';
import { useMeeting } from '@/lib/query/meetings';
import { layout } from '@/lib/theme/layout';
import {
  formatMeetingStatus,
  meetingStatusVariant,
} from '@/lib/utils/pm-status-display';

/**
 * Full-page meeting detail within a project workspace.
 */
export default function MeetingDetailPageContent({
  projectId,
  meetingId,
}: {
  projectId: string;
  meetingId: string;
}): React.ReactNode {
  const router = useRouter();
  const meetingQuery = useMeeting(projectId, meetingId, true);
  const meeting = meetingQuery.data;
  const listHref = `/projects/${projectId}/meetings`;

  return (
    <ProjectModuleGate projectId={projectId} module="meetings">
      <div className={layout.pageStack}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => router.push(listHref)}
              className="flex shrink-0 items-center gap-1 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            >
              <ArrowLeft size={14} />
              Back to meetings
            </button>
            <span className="text-[var(--color-border)]">/</span>
            {meeting ? (
              <>
                <h1 className="min-w-0 truncate font-mono text-base font-semibold leading-tight text-[var(--color-text-primary)]">
                  {meeting.meetingNumber}
                </h1>
                <span className="min-w-0 truncate text-base text-[var(--color-text-primary)]">
                  {meeting.title}
                </span>
                <span className="shrink-0">
                  <StatusBadge
                    label={formatMeetingStatus(meeting.status)}
                    variant={meetingStatusVariant(meeting.status)}
                  />
                </span>
              </>
            ) : (
              <h1 className="text-base font-semibold text-[var(--color-text-primary)]">
                Meeting
              </h1>
            )}
          </div>
          <Button onClick={() => router.push(listHref)}>All meetings</Button>
        </div>

        {meetingQuery.isError && !meeting && (
          <Alert
            type="error"
            showIcon
            title="Unable to load meeting"
            description={
              meetingQuery.error instanceof ApiRequestError
                ? meetingQuery.error.message
                : 'Please try again.'
            }
          />
        )}

        <MeetingDetailContent
          projectId={projectId}
          meetingId={meetingId}
          variant="page"
          onDeleted={() => router.push(listHref)}
        />
      </div>
    </ProjectModuleGate>
  );
}
