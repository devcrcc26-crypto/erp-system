'use client';

import { useState } from 'react';
import { Badge, Button, Dropdown, Empty, List, Spin, Typography } from 'antd';
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
    <List.Item
      className={isUnread ? 'bg-orange-50/60' : undefined}
      actions={
        isUnread
          ? [
              <Button
                key="read"
                type="link"
                size="small"
                icon={<CheckOutlined />}
                onClick={() => onRead(notification.id)}
              >
                Mark read
              </Button>,
            ]
          : undefined
      }
    >
      <List.Item.Meta
        title={
          <span className={isUnread ? 'font-semibold text-slate-900' : 'text-slate-800'}>
            {notification.subject}
          </span>
        }
        description={
          <div className="space-y-1">
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
        }
      />
    </List.Item>
  );
}

/**
 * Header bell dropdown for in-app notifications.
 */
export default function NotificationPanel(): React.ReactNode {
  const [open, setOpen] = useState(false);
  const unreadQuery = useUnreadNotificationCount(true);
  const notificationsQuery = useNotifications(
    { page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' },
    open,
  );
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  if (unreadQuery.isError) {
    const status =
      unreadQuery.error instanceof ApiRequestError
        ? unreadQuery.error.status
        : 0;
    if (status === 403 || status === 401) {
      return null;
    }
  }

  const unreadCount = unreadQuery.data?.count ?? 0;
  const notifications = notificationsQuery.data?.data ?? [];

  const dropdownContent = (
    <div
      className="w-80 rounded-md border border-slate-200 bg-white shadow-lg md:w-96"
      style={{ borderRadius: 6 }}
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
        {unreadCount > 0 && (
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

      {notificationsQuery.isLoading ? (
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
        <List
          className="max-h-96 overflow-y-auto"
          dataSource={notifications}
          renderItem={(notification) => (
            <NotificationItem
              notification={notification}
              onRead={(id) => void markRead.mutateAsync(id)}
            />
          )}
        />
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
        className="relative rounded-md p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
        aria-label="Open notifications"
      >
        <Badge count={unreadCount} size="small" offset={[-2, 2]}>
          <BellOutlined style={{ fontSize: 20 }} />
        </Badge>
      </button>
    </Dropdown>
  );
}
