import FieldMovementForm from '@/components/modules/attendance/FieldMovementForm';

export default async function FieldMovementLogPage({
  searchParams,
}: {
  searchParams: Promise<{ onBehalf?: string }>;
}): Promise<React.ReactNode> {
  const params = await searchParams;
  return <FieldMovementForm onBehalf={params.onBehalf === '1'} />;
}
