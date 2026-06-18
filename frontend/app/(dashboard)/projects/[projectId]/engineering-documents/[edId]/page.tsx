import EpcWorkspacePlaceholder from '@/components/modules/projects/workspaces/EpcWorkspacePlaceholder';

export default async function EngineeringDocumentDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; edId: string }>;
}): Promise<React.ReactNode> {
  await params;
  return (
    <EpcWorkspacePlaceholder
      title="Engineering Document"
      description="Document metadata, versions, and workflow history will appear here."
    />
  );
}
