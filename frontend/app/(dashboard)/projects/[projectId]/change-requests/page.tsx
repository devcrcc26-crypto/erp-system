import ChangeRequestList from '@/components/modules/projects/change-requests/ChangeRequestList';

export default async function ProjectChangeRequestsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<React.ReactNode> {
  const { projectId } = await params;
  return <ChangeRequestList projectId={projectId} />;
}
