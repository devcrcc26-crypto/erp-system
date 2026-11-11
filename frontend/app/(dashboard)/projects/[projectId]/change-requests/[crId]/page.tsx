import ChangeRequestDetailPageContent from '@/components/modules/projects/change-requests/ChangeRequestDetailPageContent';

export default async function ChangeRequestDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; crId: string }>;
}): Promise<React.ReactNode> {
  const { projectId, crId } = await params;
  return (
    <ChangeRequestDetailPageContent projectId={projectId} crId={crId} />
  );
}
