import EngineeringDocumentDetailPageContent from '@/components/modules/projects/engineering/EngineeringDocumentDetailPageContent';

export default async function EngineeringDocumentPage({
  params,
}: {
  params: Promise<{ projectId: string; edId: string }>;
}): Promise<React.ReactNode> {
  const { projectId, edId } = await params;
  return (
    <EngineeringDocumentDetailPageContent
      projectId={projectId}
      engineeringDocumentId={edId}
    />
  );
}
