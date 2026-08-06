import PurchaseRequestDetailPageContent from '@/components/modules/hr/purchase-request/PurchaseRequestDetailPageContent';

export default async function PurchaseRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <PurchaseRequestDetailPageContent requestId={id} />;
}
