// UI polish pass - styles only, no logic changes

'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Dropdown, Empty, Spin, Typography } from 'antd';
import { BellOutlined, CheckOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
} from '@/lib/query/notifications';
import type { InAppNotification } from '@/lib/api/documents.types';
import { ApiRequestError } from '@/lib/api/errors';
import { useAuthStore } from '@/stores/auth.store';
import { tokens } from '@/lib/theme/tokens';

dayjs.extend(relativeTime);

function NotificationItem({
  notification,
  onRead,
}: {
  notification: InAppNotification;
  onRead: (id: string) => void;
}): React.ReactNode {
  const isUnread = !notification.readAt;

  return (
    <div
      className={`flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 ${isUnread ? 'bg-orange-50/60' : ''}`}
    >
      <div className="min-w-0 flex-1">
        <p
          className={
            isUnread
              ? 'text-sm font-semibold text-slate-900'
              : 'text-sm text-slate-800'
          }
        >
          {notification.subject}
        </p>
        <div className="mt-1 space-y-1">
          <Typography.Paragraph
            className="!mb-0 text-sm text-slate-600"
            ellipsis={{ rows: 2 }}
          >
            {notification.body}
          </Typography.Paragraph>
          <span className="text-xs text-slate-400">
            {dayjs(notification.createdAt).fromNow()}
          </span>
        </div>
      </div>
      {isUnread && (
        <Button
          type="link"
          size="small"
          icon={<CheckOutlined />}
          onClick={() => onRead(notification.id)}
        >
          Mark read
        </Button>
      )}
    </div>
  );
}

/**
 * Header bell dropdown for in-app notifications.
 */
export default function NotificationPanel(): React.ReactNode {
  const [open, setOpen] = useState(false);
  const canViewNotifications = useAuthStore(
    (state) => state.capabilities.canViewNotifications,
  );
  const [allowed, setAllowed] = useState(canViewNotifications);

  useEffect(() => {
    setAllowed(canViewNotifications);
  }, [canViewNotifications]);

  const unreadQuery = useUnreadNotificationCount(allowed);
  const notificationsQuery = useNotifications(
    { page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' },
    allowed && open,
  );
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  useEffect(() => {
    if (!unreadQuery.isError || !allowed) {
      return;
    }

    const status =
      unreadQuery.error instanceof ApiRequestError
        ? unreadQuery.error.status
        : 0;

    if (status === 403 || status === 401) {
      setAllowed(false);
    }
  }, [allowed, unreadQuery.isError, unreadQuery.error]);

  const unreadCount = allowed ? (unreadQuery.data?.count ?? 0) : 0;
  const notifications = allowed ? (notificationsQuery.data?.data ?? []) : [];

  const dropdownContent = (
    <div
      className="w-80 bg-white md:w-96"
      style={{
        borderRadius: 12,
        border: `0.5px solid ${tokens.colorBorder}`,
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: `0.5px solid ${tokens.colorBorder}` }}
      >
        <h3
          className="text-[13px] font-medium"
          style={{ color: tokens.colorTextPrimary }}
        >
          Notifications
        </h3>
        {allowed && unreadCount > 0 && (
          <Button
            type="link"
            size="small"
            loading={markAllRead.isPending}
            onClick={() => void markAllRead.mutateAsync()}
          >
            Mark all read
          </Button>
        )}
      </div>

      {!allowed ? (
        <Empty
          className="py-8"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Notifications are not available for your account"
        />
      ) : notificationsQuery.isLoading ? (
        <div className="flex justify-center py-8">
          <Spin />
        </div>
      ) : notifications.length === 0 ? (
        <Empty
          className="py-8"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No notifications"
        />
      ) : (
        <div className="max-h-96 overflow-y-auto">
          {notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onRead={(id) => void markRead.mutateAsync(id)}
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Dropdown
      open={open}
      onOpenChange={setOpen}
      popupRender={() => dropdownContent}
      trigger={['click']}
      placement="bottomRight"
    >
      <button
        type="button"
        className="relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-[var(--color-surface-secondary)]"
        style={{
          border: `0.5px solid ${tokens.colorBorder}`,
          color: tokens.colorTextSecondary,
        }}
        aria-label="Open notifications"
      >
        <Badge
          count={unreadCount}
          size="small"
          offset={[-2, 2]}
          style={{
            backgroundColor: tokens.colorRed400,
            boxShadow: `0 0 0 1.5px ${tokens.colorPageBg}`,
          }}
        >
          <BellOutlined style={{ fontSize: 16 }} />
        </Badge>
      </button>
    </Dropdown>
  );
}
