import PerDiemRequestEditPageContent from '@/components/modules/hr/per-diem/PerDiemRequestEditPageContent';

export default async function EditPerDiemRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <PerDiemRequestEditPageContent requestId={id} />;
}
