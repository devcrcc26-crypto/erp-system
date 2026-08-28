import AuditLogDetailPageContent from '@/components/modules/audit/AuditLogDetailPageContent';

export default async function AuditLogDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <AuditLogDetailPageContent auditLogId={id} />;
}
