import EpcWorkspacePlaceholder from '@/components/modules/projects/workspaces/EpcWorkspacePlaceholder';

export default async function DesignPackageReviewModePage({
  params,
}: {
  params: Promise<{ packageId: string }>;
}): Promise<React.ReactNode> {
  await params;
  return (
    <EpcWorkspacePlaceholder
      title="Review Mode"
      description="Three-column review workspace with document preview, comments, and dependency snapshot."
    />
  );
}
