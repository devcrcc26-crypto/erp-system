import FlightApplicationEditPageContent from '@/components/modules/hr/flight/FlightApplicationEditPageContent';

export default async function EditFlightApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <FlightApplicationEditPageContent applicationId={id} />;
}
