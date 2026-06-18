import DesignPackageDetailPageContent from '@/components/modules/projects/design-packages/DesignPackageDetailPageContent';

export default async function DesignPackageDetailPage({
  params,
}: {
  params: Promise<{
    projectId: string;
    taskDisciplineId: string;
    packageId: string;
  }>;
}): Promise<React.ReactNode> {
  const { projectId, taskDisciplineId, packageId } = await params;
  return (
    <DesignPackageDetailPageContent
      projectId={projectId}
      taskDisciplineId={taskDisciplineId}
      packageId={packageId}
    />
  );
}
