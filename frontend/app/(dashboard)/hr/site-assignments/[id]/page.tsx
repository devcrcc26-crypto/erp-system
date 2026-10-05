import SiteAssignmentDetailPageContent from '@/components/modules/hr/site-assignment/SiteAssignmentDetailPageContent';

export default function SiteAssignmentDetailPage({
  params,
}: {
  params: { id: string };
}): React.ReactNode {
  return <SiteAssignmentDetailPageContent id={params.id} />;
}
