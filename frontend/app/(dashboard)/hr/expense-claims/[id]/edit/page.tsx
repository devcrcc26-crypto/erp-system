import ExpenseClaimEditPageContent from '@/components/modules/hr/expense-claim/ExpenseClaimEditPageContent';

export default async function ExpenseClaimEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <ExpenseClaimEditPageContent claimId={id} />;
}
