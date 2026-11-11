import RfisPageContent from '@/components/modules/projects/rfis/RfisPageContent';

export default async function ProjectRfisPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<React.ReactNode> {
  const { projectId } = await params;
  return <RfisPageContent projectId={projectId} />;
}
