import MeetingsPageContent from '@/components/modules/projects/meetings/MeetingsPageContent';

export default async function ProjectMeetingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<React.ReactNode> {
  const { projectId } = await params;
  return <MeetingsPageContent projectId={projectId} />;
}
