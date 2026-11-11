import EvaluationDetailPageContent from '@/components/modules/hr/evaluation/EvaluationDetailPageContent';

export default async function EvaluationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <EvaluationDetailPageContent evaluationId={id} />;
}
