import RisksPageContent from '@/components/modules/projects/risks/RisksPageContent';

export default async function ProjectRisksPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<React.ReactNode> {
  const { projectId } = await params;
  return <RisksPageContent projectId={projectId} />;
}
