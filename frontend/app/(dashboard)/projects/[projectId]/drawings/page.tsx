import DrawingsPageContent from '@/components/modules/projects/drawings/DrawingsPageContent';

export default async function ProjectDrawingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<React.ReactNode> {
  const { projectId } = await params;
  return <DrawingsPageContent projectId={projectId} />;
}
