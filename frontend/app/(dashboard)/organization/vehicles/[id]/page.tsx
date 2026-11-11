import VehicleDetailPageContent from '@/components/modules/org/vehicles/VehicleDetailPageContent';

export default async function CompanyVehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <VehicleDetailPageContent vehicleId={id} />;
}
