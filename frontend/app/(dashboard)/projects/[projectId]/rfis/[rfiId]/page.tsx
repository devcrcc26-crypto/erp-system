import RfiDetailPageContent from '@/components/modules/projects/rfis/RfiDetailPageContent';

export default async function RfiDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; rfiId: string }>;
}): Promise<React.ReactNode> {
  const { projectId, rfiId } = await params;
  return <RfiDetailPageContent projectId={projectId} rfiId={rfiId} />;
}
