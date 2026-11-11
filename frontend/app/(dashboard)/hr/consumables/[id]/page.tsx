import ConsumablesRequisitionDetailPageContent from '@/components/modules/hr/consumables/ConsumablesRequisitionDetailPageContent';

export default async function ConsumablesRequisitionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <ConsumablesRequisitionDetailPageContent requisitionId={id} />;
}
