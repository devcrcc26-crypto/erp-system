import ReviewInboxPageContent from '@/components/modules/projects/review/ReviewInboxPageContent';

export default async function ProjectReviewInboxPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<React.ReactNode> {
  const { projectId } = await params;
  return <ReviewInboxPageContent projectId={projectId} />;
}
