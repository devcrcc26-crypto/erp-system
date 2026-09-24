import FieldMovementLogDetailPageContent from '@/components/modules/hr/attendance/FieldMovementLogDetailPageContent';

export default async function FieldMovementLogDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <FieldMovementLogDetailPageContent logId={id} />;
}
