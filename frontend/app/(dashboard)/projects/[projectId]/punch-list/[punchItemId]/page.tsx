import PunchItemDetailPageContent from '@/components/modules/projects/punch-items/PunchItemDetailPageContent';

export default async function PunchItemDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; punchItemId: string }>;
}): Promise<React.ReactNode> {
  const { projectId, punchItemId } = await params;
  return (
    <PunchItemDetailPageContent
      projectId={projectId}
      punchItemId={punchItemId}
    />
  );
}
