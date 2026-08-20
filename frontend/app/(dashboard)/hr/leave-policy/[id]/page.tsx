import LeavePolicyDetailPageContent from '@/components/modules/hr/leave-policy/LeavePolicyDetailPageContent';

export default async function LeavePolicyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <LeavePolicyDetailPageContent policyId={id} />;
}
