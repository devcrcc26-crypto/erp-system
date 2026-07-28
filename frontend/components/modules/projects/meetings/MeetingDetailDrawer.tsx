'use client';

import { Button, Drawer } from 'antd';
import { useRouter } from 'next/navigation';
import MeetingDetailContent from '@/components/modules/projects/meetings/MeetingDetailContent';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useMeeting } from '@/lib/query/meetings';
import { wideDetailDrawerProps } from '@/lib/theme/layout';
import {
  formatMeetingStatus,
  meetingStatusVariant,
} from '@/lib/utils/pm-status-display';

/**
 * Quick-peek drawer wrapper around MeetingDetailContent.
 */
export default function MeetingDetailDrawer({
  projectId,
  meetingId,
  onClose,
  onUpdated,
}: {
  projectId: string;
  meetingId: string | null;
  onClose: () => void;
  onUpdated: () => void;
}): React.ReactNode {
  const router = useRouter();
  const open = Boolean(meetingId);
  const meetingQuery = useMeeting(projectId, meetingId ?? '', open);
  const meeting = meetingQuery.data;

  return (
    <Drawer
      {...wideDetailDrawerProps}
      open={open}
      onClose={onClose}
      destroyOnHidden
      title={
        meeting ? (
          <div className="flex max-w-full flex-wrap items-center gap-2 overflow-hidden">
            <span className="shrink-0 font-mono text-[13px] font-semibold">
              {meeting.meetingNumber}
            </span>
            <span className="min-w-0 truncate text-[13px]">{meeting.title}</span>
            <span className="shrink-0">
              <StatusBadge
                label={formatMeetingStatus(meeting.status)}
                variant={meetingStatusVariant(meeting.status)}
              />
            </span>
          </div>
        ) : (
          'Meeting'
        )
      }
      footer={
        meetingId ? (
          <div className="flex justify-end">
            <Button
              type="primary"
              onClick={() => {
                onClose();
                router.push(`/projects/${projectId}/meetings/${meetingId}`);
              }}
            >
              Open full meeting
            </Button>
          </div>
        ) : undefined
      }
    >
      {meetingId ? (
        <MeetingDetailContent
          projectId={projectId}
          meetingId={meetingId}
          variant="drawer"
          onUpdated={onUpdated}
          onDeleted={onClose}
        />
      ) : null}
    </Drawer>
  );
}
