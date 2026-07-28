import MeetingDetailPageContent from '@/components/modules/projects/meetings/MeetingDetailPageContent';

export default async function ProjectMeetingDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; meetingId: string }>;
}): Promise<React.ReactNode> {
  const { projectId, meetingId } = await params;
  return (
    <MeetingDetailPageContent projectId={projectId} meetingId={meetingId} />
  );
}
