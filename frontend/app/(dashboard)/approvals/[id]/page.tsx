import ApprovalDetailPageContent from '@/components/modules/approvals/ApprovalDetailPageContent';

export default async function ApprovalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <ApprovalDetailPageContent requestId={id} />;
}
