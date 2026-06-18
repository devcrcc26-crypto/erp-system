import EpcWorkspacePlaceholder from '@/components/modules/projects/workspaces/EpcWorkspacePlaceholder';

export default async function TaskDisciplineDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; taskDisciplineId: string }>;
}): Promise<React.ReactNode> {
  await params;
  return (
    <EpcWorkspacePlaceholder
      title="Discipline Detail"
      description="Design packages and engineering documents for this discipline will appear here."
    />
  );
}
