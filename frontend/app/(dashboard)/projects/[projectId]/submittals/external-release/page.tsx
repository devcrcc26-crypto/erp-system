import ExternalReleasePageContent from '@/components/modules/projects/submittals/ExternalReleasePageContent';

export default async function ProjectExternalReleasePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<React.ReactNode> {
  const { projectId } = await params;
  return <ExternalReleasePageContent projectId={projectId} />;
}
