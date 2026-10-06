import AnnouncementsManageListPageContent from '@/components/modules/announcements/hr/AnnouncementsManageListPageContent';

export default async function HrAnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}): Promise<React.ReactNode> {
  const { type } = await searchParams;
  return (
    <AnnouncementsManageListPageContent
      initialType={type === 'SYSTEM_UPDATE' ? 'SYSTEM_UPDATE' : 'COMPANY'}
    />
  );
}
