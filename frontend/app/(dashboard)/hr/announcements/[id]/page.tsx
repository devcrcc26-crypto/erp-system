import AnnouncementManageDetailPageContent from '@/components/modules/announcements/hr/AnnouncementManageDetailPageContent';

export default async function HrAnnouncementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <AnnouncementManageDetailPageContent id={id} />;
}
