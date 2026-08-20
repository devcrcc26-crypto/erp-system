import EditEmployeeFormContent from '@/components/modules/users/add-employee/EditEmployeeFormContent';

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <EditEmployeeFormContent userId={id} />;
}
