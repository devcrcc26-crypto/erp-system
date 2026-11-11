'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge,
  Button,
  Dropdown,
  Segmented,
  Spin,
  Tooltip,
} from 'antd';
import {
  BellOutlined,
  RightOutlined,
} from '@ant-design/icons';
import NotificationInboxItem from '@/components/ui/NotificationInboxItem/NotificationInboxItem';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
} from '@/lib/query/notifications';
import type { InAppNotification } from '@/lib/api/documents.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAuthStore } from '@/stores/auth.store';
import { tokens } from '@/lib/theme/tokens';

type InboxFilter = 'all' | 'unread';

/**
 * Header bell dropdown for in-app notifications.
 */
export default function NotificationPanel(): React.ReactNode {
  const router = useRouter();
  const { t } = useEpcTranslation();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<InboxFilter>('all');
  const allowed = useAuthStore((state) => state.isAuthenticated());

  const unreadQuery = useUnreadNotificationCount(allowed);
  const notificationsQuery = useNotifications(
    {
      page: 1,
      limit: 10,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      unreadOnly: filter === 'unread' ? true : undefined,
    },
    allowed && open,
  );
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const unreadCount = allowed ? (unreadQuery.data?.count ?? 0) : 0;
  const notifications = allowed ? (notificationsQuery.data?.data ?? []) : [];

  function handleNavigate(notification: InAppNotification): void {
    if (!notification.link) return;
    if (!notification.readAt) {
      void markRead.mutateAsync(notification.id).catch(() => undefined);
    }
    setOpen(false);
    router.push(notification.link);
  }

  const dropdownContent = (
    <div
      className="erp-header-dropdown-v2 flex w-[min(400px,calc(100vw-24px))] flex-col"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="erp-hd-head px-5 pb-3 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="erp-hd-icon" aria-hidden>
              <BellOutlined style={{ fontSize: 16 }} />
            </div>
            <div className="min-w-0">
              <h3 className="erp-hd-title">{t('nav.notifications')}</h3>
              {allowed && unreadCount > 0 ? (
                <p className="erp-hd-sub">
                  {t('pages.notifications.unreadBadge', { count: unreadCount })}
                </p>
              ) : null}
            </div>
          </div>
          {allowed && unreadCount > 0 ? (
            <Button
              size="small"
              loading={markAllRead.isPending}
              className="erp-hd-pill-button"
              onClick={() => void markAllRead.mutateAsync()}
            >
              {t('pages.notifications.markAllRead')}
            </Button>
          ) : null}
        </div>

        {allowed ? (
          <div className="mt-3">
            <Segmented
              block
              size="small"
              value={filter}
              onChange={(value) => setFilter(value as InboxFilter)}
              options={[
                { label: t('pages.notifications.filterAll'), value: 'all' },
                {
                  label:
                    unreadCount > 0
                      ? `${t('pages.notifications.filterUnread')} (${unreadCount})`
                      : t('pages.notifications.filterUnread'),
                  value: 'unread',
                },
              ]}
            />
          </div>
        ) : null}
      </div>

      {open && notificationsQuery.isLoading ? (
        <div className="flex justify-center py-12">
          <Spin />
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <div className="erp-hd-empty-icon" aria-hidden>
            <BellOutlined style={{ fontSize: 20 }} />
          </div>
          <p className="erp-hd-empty-text">
            {filter === 'unread'
              ? t('pages.notifications.emptyUnread')
              : t('pages.notifications.empty')}
          </p>
        </div>
      ) : (
        <div className="erp-hd-list max-h-[min(440px,60vh)] overflow-y-auto">
          <div className="divide-y divide-[#eef1f4]">
            {notifications.map((notification) => (
              <NotificationInboxItem
                key={notification.id}
                notification={notification}
                variant="panel"
                onRead={(id) =>
                  void markRead.mutateAsync(id).catch(() => undefined)
                }
                onNavigate={handleNavigate}
                markReadLabel={t('pages.notifications.markRead')}
                readLabel={t('pages.notifications.read')}
                unreadLabel={t('pages.notifications.unread')}
              />
            ))}
          </div>
        </div>
      )}

      <div className="erp-hd-foot p-2">
        <Button
          type="text"
          block
          className="erp-hd-foot-button"
          onClick={() => {
            setOpen(false);
            router.push('/notifications');
          }}
        >
          {t('pages.notifications.showAll')}
          <RightOutlined style={{ fontSize: 11 }} />
        </Button>
      </div>
    </div>
  );

  return (
    <Dropdown
      open={open}
      onOpenChange={setOpen}
      popupRender={() => dropdownContent}
      trigger={['click']}
      placement="bottomRight"
      rootClassName="erp-hd-dropdown-root"
    >
      {/* Hide the tooltip while the panel is open - it covered "Mark all read". */}
      <Tooltip title={t('nav.notifications')} open={open ? false : undefined}>
        <button
          type="button"
          className={[
            'relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
            open
              ? 'bg-[var(--color-teal-50)] text-[var(--color-teal-600)]'
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]',
          ].join(' ')}
          aria-label={t('pages.notifications.panelAria')}
          aria-expanded={open}
        >
          <Badge
            count={unreadCount}
            size="small"
            overflowCount={99}
            offset={[-1, 1]}
            style={{
              backgroundColor: tokens.colorRed400,
              boxShadow: `0 0 0 1.5px ${tokens.colorCardBg}`,
              fontSize: 10,
              minWidth: 16,
              height: 16,
              lineHeight: '16px',
            }}
          >
            <BellOutlined style={{ fontSize: 17 }} />
          </Badge>
        </button>
      </Tooltip>
    </Dropdown>
  );
}
