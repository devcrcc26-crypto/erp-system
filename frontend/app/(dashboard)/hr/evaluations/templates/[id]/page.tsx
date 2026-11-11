import EvaluationTemplateDetailPageContent from '@/components/modules/hr/evaluation/EvaluationTemplateDetailPageContent';

export default async function EvaluationTemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <EvaluationTemplateDetailPageContent templateId={id} />;
}
