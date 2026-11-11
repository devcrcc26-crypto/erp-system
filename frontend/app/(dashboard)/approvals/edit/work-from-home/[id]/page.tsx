import WorkFromHomeEditPageContent from '@/components/modules/hr/attendance/WorkFromHomeEditPageContent';

export default async function EditWorkFromHomeRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <WorkFromHomeEditPageContent approvalRequestId={id} />;
}
