import ExternalReleaseDetailPageContent from '@/components/modules/projects/submittals/ExternalReleaseDetailPageContent';

export default async function ExternalReleaseDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; submittalId: string }>;
}): Promise<React.ReactNode> {
  const { projectId, submittalId } = await params;
  return (
    <ExternalReleaseDetailPageContent
      projectId={projectId}
      submittalId={submittalId}
    />
  );
}
