import SiteAssignmentDetailPageContent from '@/components/modules/hr/site-assignment/SiteAssignmentDetailPageContent';

export default async function SiteAssignmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <SiteAssignmentDetailPageContent id={id} />;
}
