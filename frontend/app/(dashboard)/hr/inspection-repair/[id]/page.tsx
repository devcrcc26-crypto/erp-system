import InspectionRepairDetailPageContent from '@/components/modules/hr/inspection-repair/InspectionRepairDetailPageContent';

export default async function InspectionRepairDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <InspectionRepairDetailPageContent requestId={id} />;
}
