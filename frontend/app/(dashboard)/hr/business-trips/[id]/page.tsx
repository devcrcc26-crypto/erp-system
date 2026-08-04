import BusinessTripDetailPageContent from '@/components/modules/hr/business-trip/BusinessTripDetailPageContent';

export default async function BusinessTripDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <BusinessTripDetailPageContent tripId={id} />;
}
