import PunchItemsPageContent from '@/components/modules/projects/punch-items/PunchItemsPageContent';

export default async function ProjectPunchListPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<React.ReactNode> {
  const { projectId } = await params;
  return <PunchItemsPageContent projectId={projectId} />;
}
