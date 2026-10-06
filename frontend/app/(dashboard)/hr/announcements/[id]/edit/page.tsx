import AnnouncementEditPageContent from '@/components/modules/announcements/hr/AnnouncementEditPageContent';

export default async function EditAnnouncementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <AnnouncementEditPageContent id={id} />;
}
