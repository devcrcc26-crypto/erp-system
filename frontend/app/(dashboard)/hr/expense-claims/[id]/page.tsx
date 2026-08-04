import ExpenseClaimDetailPageContent from '@/components/modules/hr/expense-claim/ExpenseClaimDetailPageContent';

export default async function ExpenseClaimDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <ExpenseClaimDetailPageContent claimId={id} />;
}
