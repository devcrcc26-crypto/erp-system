import OvertimeRequestDetailPageContent from '@/components/modules/hr/overtime/OvertimeRequestDetailPageContent';

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <OvertimeRequestDetailPageContent requestId={id} />;
}
