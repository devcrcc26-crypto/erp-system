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
import OverviewCard from './tabs/overview/OverviewCard';
import OverviewEmptyState from './tabs/overview/OverviewEmptyState';

/** Latest three unexpired announcements, unread first. */
export default function AnnouncementsWidget({ enabled }: { enabled: boolean }): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const query = useAnnouncementsSummary(enabled);
  const items = query.data?.latest ?? [];

  return (
    <OverviewCard
      title={t('announcements.widget.title')}
      icon={<Megaphone size={18} strokeWidth={1.9} />}
      tone="info"
      viewAllHref="/announcements"
      query={query}
      isEmpty={items.length === 0}
      emptyState={
        <OverviewEmptyState
          icon={Megaphone}
          title={t('announcements.widget.empty')}
        />
      }
    >
      <ul className="m-0 flex flex-col p-0">
        {items.map((item) => (
          <li key={item.id} className="list-none">
            <Link
              href={`/announcements/${item.id}`}
              className="flex items-start gap-3 border-b border-slate-100 py-3 text-inherit no-underline last:border-b-0 last:pb-0 transition-colors hover:bg-slate-50/80 -mx-1 rounded-lg px-1"
            >
              <span className="min-w-0 flex-1">
                <span
                  className={`block truncate text-sm ${
                    item.readAt ? 'font-medium text-slate-800' : 'font-semibold text-slate-900'
                  }`}
                >
                  {item.readAt ? null : (
                    <span className="sr-only">{t('announcements.list.unreadLabel')}: </span>
                  )}
                  {!item.readAt ? (
                    <span
                      aria-hidden
                      className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 align-middle"
                    />
                  ) : null}
                  {localized(locale, item.title, item.titleZh)}
                </span>
                <span className="mt-0.5 block truncate text-xs text-slate-500">
                  {localized(locale, item.excerpt, item.excerptZh)}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                {item.priority !== 'NORMAL' ? (
                  <span
                    className="rounded-full px-2 text-[11px] font-semibold leading-[18px]"
                    style={priorityTagStyle(item.priority)}
                  >
                    {t(priorityLabelKey(item.priority))}
                  </span>
                ) : null}
                <span className="text-xs tabular-nums text-slate-400">
                  {formatAnnouncementDay(item.publishedAt)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </OverviewCard>
  );
}
