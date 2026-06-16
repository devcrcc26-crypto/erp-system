import CorrespondencePageContent from '@/components/modules/projects/correspondence/CorrespondencePageContent';

export default async function ProjectCorrespondencePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<React.ReactNode> {
  const { projectId } = await params;
  return <CorrespondencePageContent projectId={projectId} />;
}
