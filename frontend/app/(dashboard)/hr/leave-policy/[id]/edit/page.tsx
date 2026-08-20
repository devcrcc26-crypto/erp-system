import LeavePolicyFormPageContent from '@/components/modules/hr/leave-policy/LeavePolicyFormPageContent';

export default async function EditLeavePolicyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <LeavePolicyFormPageContent policyId={id} />;
}
