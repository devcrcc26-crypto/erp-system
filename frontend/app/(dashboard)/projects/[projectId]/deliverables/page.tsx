import DeliverableList from '@/components/modules/projects/deliverables/DeliverableList';

export default async function ProjectDeliverablesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<React.ReactNode> {
  const { projectId } = await params;
  return <DeliverableList projectId={projectId} />;
}
