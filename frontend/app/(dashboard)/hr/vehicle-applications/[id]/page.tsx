import VehicleApplicationDetailPageContent from '@/components/modules/hr/vehicle-application/VehicleApplicationDetailPageContent';

export default async function VehicleApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <VehicleApplicationDetailPageContent applicationId={id} />;
}
