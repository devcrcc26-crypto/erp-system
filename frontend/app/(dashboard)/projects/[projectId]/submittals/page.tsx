import SubmittalsPageContent from '@/components/modules/projects/submittals/SubmittalsPageContent';

export default async function ProjectSubmittalsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<React.ReactNode> {
  const { projectId } = await params;
  return <SubmittalsPageContent projectId={projectId} />;
}
