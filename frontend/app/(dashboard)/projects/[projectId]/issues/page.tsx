import IssuesPageContent from '@/components/modules/projects/issues/IssuesPageContent';

export default async function ProjectIssuesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<React.ReactNode> {
  const { projectId } = await params;
  return <IssuesPageContent projectId={projectId} />;
}
