'use client';

import './announcements.css';
import { useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Pagination, Segmented, Spin } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { BellRing, Megaphone, Pin, Settings2, Sparkles } from 'lucide-react';
import { useCanManageAnnouncements, useIsSystemAdmin } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { AnnouncementType, MyAnnouncementSummary } from '@/lib/api/announcements.types';
import { useAnnouncementsSummary, useMyAnnouncements } from '@/lib/query/announcements';
import {
  formatAnnouncementDay,
  localized,
  personName,
  priorityLabelKey,
  priorityTagStyle,
} from './announcement-display';

const PAGE_SIZE = 20;

export function AnnouncementListItem({
  item,
}: {
  item: MyAnnouncementSummary;
}): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const unread = !item.readAt;
  const urgent = item.priority === 'URGENT';
  const title = localized(locale, item.title, item.titleZh);
  return (
    <li>
      <Link
        href={`/announcements/${item.id}`}
        className={`erp-ann-item${unread ? ' erp-ann-item--unread' : ''}`}
        aria-label={unread ? `${t('announcements.list.unreadLabel')}: ${title}` : title}
      >
        <span
          className={`erp-ann-item-icon${urgent ? ' erp-ann-item-icon--urgent' : ''}`}
          aria-hidden
        >
          {item.type === 'SYSTEM_UPDATE' ? (
            <Sparkles size={18} strokeWidth={2} />
          ) : urgent ? (
            <BellRing size={18} strokeWidth={2} />
          ) : (
            <Megaphone size={18} strokeWidth={2} />
          )}
        </span>
        <span className="erp-ann-item-main">
          <span className="erp-ann-item-title">
            {unread ? <span className="erp-ann-dot" aria-hidden /> : null}
            <span>{title}</span>
            {item.pinned ? (
              <span className="erp-ann-tag erp-ann-tag--pin">
                <Pin size={11} strokeWidth={2.5} aria-hidden />
                {t('announcements.list.pinned')}
              </span>
            ) : null}
            {item.priority !== 'NORMAL' ? (
              <span className="erp-ann-tag" style={priorityTagStyle(item.priority)}>
                {t(priorityLabelKey(item.priority))}
              </span>
            ) : null}
          </span>
          <span className="erp-ann-item-excerpt">
            {localized(locale, item.excerpt, item.excerptZh)}
          </span>
          <span className="erp-ann-meta">
            <span>{personName(item.author)}</span>
            <span>{formatAnnouncementDay(item.publishedAt)}</span>
            {item.isExpired ? (
              <span className="erp-ann-tag erp-ann-tag--muted">{t('announcements.list.expired')}</span>
            ) : null}
            {item.requireAcknowledgement ? (
              item.acknowledgedAt ? (
                <span className="erp-ann-tag erp-ann-tag--ok">{t('announcements.ack.done')}</span>
              ) : (
                <span className="erp-ann-tag" style={priorityTagStyle('IMPORTANT')}>
                  {t('announcements.ack.required')}
                </span>
              )
            ) : null}
          </span>
        </span>
      </Link>
    </li>
  );
}

/**
 * The signed-in user's announcements (or What's new history): pinned first,
 * then newest; unread items are bold with a dot.
 */
export default function AnnouncementsPageContent({
  type = 'COMPANY',
}: {
  type?: AnnouncementType;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [page, setPage] = useState(1);
  const listQuery = useMyAnnouncements({ type, filter, page, limit: PAGE_SIZE });
  const summary = useAnnouncementsSummary(type === 'COMPANY');
  const isWhatsNew = type === 'SYSTEM_UPDATE';
  const canManageAnnouncements = useCanManageAnnouncements();
  const isSystemAdmin = useIsSystemAdmin();
  // Managers create from here too; What's new posts are System Administrator only.
  const canCreateHere = isWhatsNew ? isSystemAdmin : canManageAnnouncements;
  const manageHref = isWhatsNew ? '/hr/announcements?type=SYSTEM_UPDATE' : '/hr/announcements';
  const createHref = isWhatsNew ? '/hr/announcements/new?type=SYSTEM_UPDATE' : '/hr/announcements/new';
  const rows = listQuery.data?.data ?? [];
  const total = listQuery.data?.meta.total ?? 0;

  return (
    <div className="erp-ann-page">
      <section className="erp-ann-card">
        <div className="erp-ann-toolbar">
          <h2 className="erp-ann-toolbar-title">
            {isWhatsNew ? t('announcements.whatsNew.title') : t('announcements.list.title')}
            <span className="erp-ann-count">{total.toLocaleString()}</span>
          </h2>
          <div className="erp-ann-toolbar-actions">
            <Segmented<'all' | 'unread'>
              value={filter}
              onChange={(value) => {
                setFilter(value);
                setPage(1);
              }}
              options={[
                { value: 'all', label: t('announcements.list.filterAll') },
                {
                  value: 'unread',
                  label:
                    !isWhatsNew && summary.data
                      ? `${t('announcements.list.filterUnread')} (${summary.data.unreadCount})`
                      : t('announcements.list.filterUnread'),
                },
              ]}
            />
            {isWhatsNew ? (
              <Link href="/announcements">
                <Button>{t('announcements.list.title')}</Button>
              </Link>
            ) : (
              <Link href="/whats-new">
                <Button icon={<Sparkles size={14} strokeWidth={2} />}>
                  {t('announcements.whatsNew.title')}
                </Button>
              </Link>
            )}
            {canCreateHere ? (
              <>
                <Link href={manageHref}>
                  <Button icon={<Settings2 size={14} strokeWidth={2} />}>
                    {t('announcements.list.manage')}
                  </Button>
                </Link>
                <Link href={createHref}>
                  <Button type="primary" icon={<PlusOutlined />}>
                    {isWhatsNew ? t('announcements.manage.newSystem') : t('announcements.manage.new')}
                  </Button>
                </Link>
              </>
            ) : null}
          </div>
        </div>

        {listQuery.isError ? (
          <div className="px-5 pb-5">
            <Alert type="error" showIcon title={t('announcements.list.loadError')} />
          </div>
        ) : listQuery.isLoading ? (
          <div className="flex justify-center py-16">
            <Spin />
          </div>
        ) : rows.length === 0 ? (
          <p className="erp-ann-empty">
            {filter === 'unread'
              ? t('announcements.list.emptyUnread')
              : isWhatsNew
                ? t('announcements.whatsNew.empty')
                : t('announcements.list.empty')}
          </p>
        ) : (
          <ul className="erp-ann-list" aria-busy={listQuery.isFetching}>
            {rows.map((item) => (
              <AnnouncementListItem key={item.id} item={item} />
            ))}
          </ul>
        )}

        {total > PAGE_SIZE ? (
          <div className="erp-ann-pagination">
            <Pagination
              current={page}
              pageSize={PAGE_SIZE}
              total={total}
              showSizeChanger={false}
              onChange={setPage}
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}
