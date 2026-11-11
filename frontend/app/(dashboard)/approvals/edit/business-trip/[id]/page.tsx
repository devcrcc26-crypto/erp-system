import BusinessTripEditPageContent from '@/components/modules/hr/business-trip/BusinessTripEditPageContent';

export default async function EditBusinessTripPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <BusinessTripEditPageContent tripId={id} />;
}
