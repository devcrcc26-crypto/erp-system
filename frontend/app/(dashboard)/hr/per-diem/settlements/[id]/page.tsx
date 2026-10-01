import PerDiemSettlementDetailPageContent from '@/components/modules/hr/per-diem/PerDiemSettlementDetailPageContent';

export default async function PerDiemSettlementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <PerDiemSettlementDetailPageContent settlementId={id} />;
}
