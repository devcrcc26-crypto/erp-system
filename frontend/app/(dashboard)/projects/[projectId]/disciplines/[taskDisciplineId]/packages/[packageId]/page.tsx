import EpcWorkspacePlaceholder from '@/components/modules/projects/workspaces/EpcWorkspacePlaceholder';

export default async function DesignPackageDetailPage({
  params,
}: {
  params: Promise<{
    projectId: string;
    taskDisciplineId: string;
    packageId: string;
  }>;
}): Promise<React.ReactNode> {
  await params;
  return (
    <EpcWorkspacePlaceholder
      title="Design Package"
      description="Package items, dependencies, and workflow actions will appear here."
    />
  );
}
