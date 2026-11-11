import EmployeeContractFormContent from '@/components/modules/hr/employee-contract/EmployeeContractFormContent';

export default async function EditEmployeeContractPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <EmployeeContractFormContent contractId={id} />;
}
