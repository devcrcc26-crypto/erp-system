import EditVehicleFormContent from '@/components/modules/org/vehicles/add-vehicle/EditVehicleFormContent';

export default async function EditCompanyVehiclePage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <EditVehicleFormContent vehicleId={id} />;
}
