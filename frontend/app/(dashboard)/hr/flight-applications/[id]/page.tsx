import FlightApplicationDetailPageContent from '@/components/modules/hr/flight/FlightApplicationDetailPageContent';

export default async function FlightApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <FlightApplicationDetailPageContent applicationId={id} />;
}
