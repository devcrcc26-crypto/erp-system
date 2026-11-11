import AnnouncementDetailPageContent from '@/components/modules/announcements/AnnouncementDetailPageContent';

export default async function AnnouncementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <AnnouncementDetailPageContent id={id} />;
}
