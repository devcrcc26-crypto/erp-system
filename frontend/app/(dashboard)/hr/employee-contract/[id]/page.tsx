import EmployeeContractDetailPageContent from "@/components/modules/hr/employee-contract/EmployeeContractDetailPageContent";

export default async function EmployeeContractDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
    const { id } = await params;
    return <EmployeeContractDetailPageContent contractId={id} />;
}