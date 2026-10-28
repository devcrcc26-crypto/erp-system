import VehicleApplicationEditPageContent from '@/components/modules/hr/vehicle-application/VehicleApplicationEditPageContent';

export default async function EditVehicleApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <VehicleApplicationEditPageContent applicationId={id} />;
}
