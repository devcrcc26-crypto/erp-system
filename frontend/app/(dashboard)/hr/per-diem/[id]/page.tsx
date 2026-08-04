import PerDiemRequestDetailPageContent from '@/components/modules/hr/per-diem/PerDiemRequestDetailPageContent';

export default async function PerDiemRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <PerDiemRequestDetailPageContent requestId={id} />;
}
