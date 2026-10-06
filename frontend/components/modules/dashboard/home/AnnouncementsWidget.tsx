'use client';

import Link from 'next/link';
import { Megaphone } from 'lucide-react';
import {
  formatAnnouncementDay,
  localized,
  priorityLabelKey,
  priorityTagStyle,
} from '@/components/modules/announcements/announcement-display';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAnnouncementsSummary } from '@/lib/query/announcements';
import WidgetCard from './WidgetCard';

/** Latest three unexpired announcements, unread first. */
export default function AnnouncementsWidget({ enabled }: { enabled: boolean }): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const query = useAnnouncementsSummary(enabled);
  const items = query.data?.latest ?? [];

  return (
    <WidgetCard
      title={t('announcements.widget.title')}
      icon={<Megaphone size={18} strokeWidth={1.9} />}
      span={12}
      viewAllHref="/announcements"
      query={query}
      isEmpty={items.length === 0}
      emptyLabel={t('announcements.widget.empty')}
    >
      <ul className="dv2-list">
        {items.map((item) => (
          <li key={item.id}>
            <Link href={`/announcements/${item.id}`} className="dv2-list-row">
              <span className="dv2-list-main">
                <span
                  className="dv2-list-title"
                  style={item.readAt ? undefined : { fontWeight: 700 }}
                >
                  {item.readAt ? null : (
                    <span className="sr-only">{t('announcements.list.unreadLabel')}: </span>
                  )}
                  {localized(locale, item.title, item.titleZh)}
                </span>
                <span className="dv2-list-sub">{localized(locale, item.excerpt, item.excerptZh)}</span>
              </span>
              <span className="dv2-list-meta flex flex-col items-end gap-1">
                {item.priority !== 'NORMAL' ? (
                  <span
                    className="rounded-full px-2 text-xs font-semibold leading-[18px]"
                    style={priorityTagStyle(item.priority)}
                  >
                    {t(priorityLabelKey(item.priority))}
                  </span>
                ) : null}
                {formatAnnouncementDay(item.publishedAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}
