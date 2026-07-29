import IssueDetailPageContent from '@/components/modules/projects/issues/IssueDetailPageContent';

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; issueId: string }>;
}): Promise<React.ReactNode> {
  const { projectId, issueId } = await params;
  return <IssueDetailPageContent projectId={projectId} issueId={issueId} />;
}
