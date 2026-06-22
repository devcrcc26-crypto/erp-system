import MyCommentsPageContent from '@/components/modules/projects/review/MyCommentsPageContent';

export default async function ProjectMyCommentsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<React.ReactNode> {
  const { projectId } = await params;
  return <MyCommentsPageContent projectId={projectId} />;
}
