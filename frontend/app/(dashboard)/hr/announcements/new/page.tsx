import AnnouncementForm from '@/components/modules/announcements/hr/AnnouncementForm';

export default async function NewAnnouncementPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}): Promise<React.ReactNode> {
  const { type } = await searchParams;
  return <AnnouncementForm initialType={type === 'SYSTEM_UPDATE' ? 'SYSTEM_UPDATE' : 'COMPANY'} />;
}
