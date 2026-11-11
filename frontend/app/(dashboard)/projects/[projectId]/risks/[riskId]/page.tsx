import RiskDetailPageContent from '@/components/modules/projects/risks/RiskDetailPageContent';

export default async function RiskDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; riskId: string }>;
}): Promise<React.ReactNode> {
  const { projectId, riskId } = await params;
  return <RiskDetailPageContent projectId={projectId} riskId={riskId} />;
}
