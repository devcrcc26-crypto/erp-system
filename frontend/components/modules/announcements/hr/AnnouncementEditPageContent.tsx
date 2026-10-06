'use client';

import { Alert, Skeleton } from 'antd';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useManagedAnnouncement } from '@/lib/query/announcements';
import AnnouncementForm from './AnnouncementForm';

/** Loads an announcement, then shows the form with its current values. */
export default function AnnouncementEditPageContent({ id }: { id: string }): React.ReactNode {
  const { t } = useEpcTranslation();
  const query = useManagedAnnouncement(id);

  if (query.isLoading) {
    return <Skeleton active paragraph={{ rows: 10 }} />;
  }
  if (query.isError || !query.data) {
    return <Alert type="error" showIcon title={t('announcements.detail.notFound')} />;
  }
  if (!query.data.permissions.canEdit) {
    return <Alert type="warning" showIcon title={t('announcements.form.cannotEdit')} />;
  }
  return <AnnouncementForm key={query.data.id} existing={query.data} />;
}
