import PayrollRunDetailPageContent from '@/components/modules/hr/payroll/PayrollRunDetailPageContent';

export default async function PayrollRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <PayrollRunDetailPageContent runId={id} />;
}
