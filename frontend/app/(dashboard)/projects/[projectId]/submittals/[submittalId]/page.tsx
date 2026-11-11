import ConstructionSubmittalDetailPageContent from '@/components/modules/projects/submittals/ConstructionSubmittalDetailPageContent';

export default async function ConstructionSubmittalDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; submittalId: string }>;
}): Promise<React.ReactNode> {
  const { projectId, submittalId } = await params;
  return (
    <ConstructionSubmittalDetailPageContent
      projectId={projectId}
      submittalId={submittalId}
    />
  );
}
