import VehicleRefuelingDetailPageContent from '@/components/modules/hr/vehicle-refueling/VehicleRefuelingDetailPageContent';

export default async function VehicleRefuelingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <VehicleRefuelingDetailPageContent refuelingId={id} />;
}
