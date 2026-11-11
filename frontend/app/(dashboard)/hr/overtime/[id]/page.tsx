import OvertimeSheetDetailPageContent from '@/components/modules/hr/overtime/OvertimeSheetDetailPageContent';

export default async function OvertimeSheetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <OvertimeSheetDetailPageContent sheetId={id} />;
}
