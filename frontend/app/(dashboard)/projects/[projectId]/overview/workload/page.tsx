import WorkloadPageContent from '@/components/modules/projects/workspaces/WorkloadPageContent';

export default async function ProjectWorkloadPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<React.ReactNode> {
  const { projectId } = await params;
  return <WorkloadPageContent projectId={projectId} />;
}
