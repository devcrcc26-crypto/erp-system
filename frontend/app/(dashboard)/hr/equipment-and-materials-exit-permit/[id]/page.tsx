import ExitPermitDetailPageContent from '@/components/modules/hr/exit-permit/ExitPermitDetailPageContent';

export default async function ExitPermitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <ExitPermitDetailPageContent permitId={id} />;
}
