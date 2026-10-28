import ApprovalEditRedirect from '@/components/modules/approvals/ApprovalEditRedirect';

export default async function ApprovalEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <ApprovalEditRedirect requestId={id} />;
}
