import EmployeeDetailPageContent from '@/components/modules/users/EmployeeDetailPageContent';

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <EmployeeDetailPageContent userId={id} />;
}
