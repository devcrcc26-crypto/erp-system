import MyWorkPageContent from '@/components/modules/projects/workspaces/MyWorkPageContent';

export default async function ProjectMyWorkPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<React.ReactNode> {
  const { projectId } = await params;
  return <MyWorkPageContent projectId={projectId} />;
}
