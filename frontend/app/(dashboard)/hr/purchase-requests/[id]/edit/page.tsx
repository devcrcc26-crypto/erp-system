import PurchaseRequestEditPageContent from '@/components/modules/hr/purchase-request/PurchaseRequestEditPageContent';

export default async function PurchaseRequestEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <PurchaseRequestEditPageContent requestId={id} />;
}
