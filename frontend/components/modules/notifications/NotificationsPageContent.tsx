'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Empty, Segmented } from 'antd';
import { CheckOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import DataTable from '@/components/ui/DataTable/DataTable';
import { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import TableUpdatingIndicator from '@/components/ui/TableUpdatingIndicator/TableUpdatingIndicator';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type { InAppNotification } from '@/lib/api/documents.types';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
} from '@/lib/query/notifications';
import { useAuthStore } from '@/stores/auth.store';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import type { ColumnsType } from 'antd/es/table';

dayjs.extend(relativeTime);

type InboxFilter = 'all' | 'unread';

/**
 * Full-page notification inbox with read actions and pagination.
 */
export default function NotificationsPageContent(): React.ReactNode {
  const router = useRouter();
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const allowed = useAuthStore((state) => state.isAuthenticated());
  const { params, resetPage, bindMeta } = useTablePagination();
  const [filter, setFilter] = useState<InboxFilter>('all');

  const listParams = useMemo(
    () => ({
      ...params,
      sortBy: 'createdAt',
      sortOrder: 'desc' as const,
      unreadOnly: filter === 'unread' ? true : undefined,
    }),
    [params, filter],
  );

  const listQuery = useNotifications(listParams, allowed);
  const unreadQuery = useUnreadNotificationCount(allowed);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;
  const unreadCount = unreadQuery.data?.count ?? 0;

  async function handleMarkRead(id: string): Promise<void> {
    try {
      await markRead.mutateAsync(id);
    } catch (error: unknown) {
      notifyApiError(error, t('pages.notifications.markReadFailed'), messageApi);
    }
  }

  async function handleMarkAllRead(): Promise<void> {
    try {
      await markAllRead.mutateAsync();
      messageApi.success(t('pages.notifications.markedAllRead'));
    } catch (error: unknown) {
      notifyApiError(error, t('pages.notifications.markAllFailed'), messageApi);
    }
  }

  function handleOpen(notification: InAppNotification): void {
    if (!notification.readAt) {
      void markRead.mutateAsync(notification.id).catch(() => undefined);
    }
    if (notification.link) {
      router.push(notification.link);
    }
  }

  const columns: ColumnsType<InAppNotification> = [
    {
      title: t('pages.notifications.columns.notification'),
      key: 'notification',
      render: (_: unknown, row: InAppNotification) => {
        const isUnread = !row.readAt;
        return (
          <div className="min-w-0 py-0.5">
            <p
              className={`m-0 text-sm ${
                isUnread
                  ? 'font-semibold text-[var(--color-text-primary)]'
                  : 'font-medium text-[var(--color-text-primary)]'
              }`}
            >
              {row.subject}
            </p>
            <p className="m-0 mt-1 text-sm text-[var(--color-text-secondary)] line-clamp-2">
              {row.body}
            </p>
          </div>
        );
      },
    },
    {
      title: t('pages.notifications.columns.when'),
      key: 'when',
      width: 140,
      render: (_: unknown, row: InAppNotification) => (
        <span className="text-sm text-[var(--color-text-tertiary)]">
          {dayjs(row.createdAt).fromNow()}
        </span>
      ),
    },
    {
      title: t('pages.notifications.columns.status'),
      key: 'status',
      width: 100,
      render: (_: unknown, row: InAppNotification) =>
        row.readAt ? (
          <span className="text-xs text-[var(--color-text-tertiary)]">
            {t('pages.notifications.read')}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-teal-600)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-teal-400)]" />
            {t('pages.notifications.unread')}
          </span>
        ),
    },
    {
      title: '',
      key: 'actions',
      width: 120,
      render: (_: unknown, row: InAppNotification) =>
        !row.readAt ? (
          <Button
            type="link"
            size="small"
            icon={<CheckOutlined />}
            loading={markRead.isPending && markRead.variables === row.id}
            onClick={(event) => {
              event.stopPropagation();
              void handleMarkRead(row.id);
            }}
          >
            {t('pages.notifications.markRead')}
          </Button>
        ) : null,
    },
  ];

  if (!allowed) {
    return (
      <Alert
        type="warning"
        showIcon
        title={t('pages.notifications.signInRequired')}
      />
    );
  }

  if (listQuery.isLoading && !listQuery.data) {
    return <PageLoadingSkeleton />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={filter}
          onChange={(value) => {
            setFilter(value as InboxFilter);
            resetPage();
          }}
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
        <div className="flex items-center gap-2">
          <TableUpdatingIndicator active={listQuery.isFetching} />
          {unreadCount > 0 ? (
            <Button
              loading={markAllRead.isPending}
              onClick={() => void handleMarkAllRead()}
            >
              {t('pages.notifications.markAllRead')}
            </Button>
          ) : null}
        </div>
      </div>

      {listQuery.isError ? (
        <Alert
          type="error"
          showIcon
          title={
            listQuery.error instanceof ApiRequestError
              ? listQuery.error.message
              : t('pages.notifications.loadFailed')
          }
        />
      ) : null}

      <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] overflow-hidden">
        <DataTable<InAppNotification>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={listQuery.isFetching && Boolean(listQuery.data)}
          onRow={(record) => ({
            onClick: () => handleOpen(record),
            style: {
              cursor: record.link ? 'pointer' : 'default',
              background: record.readAt
                ? undefined
                : 'var(--color-teal-50)',
            },
          })}
          locale={{
            emptyText: (
              <Empty
                className="py-10"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  filter === 'unread'
                    ? t('pages.notifications.emptyUnread')
                    : t('pages.notifications.empty')
                }
              />
            ),
          }}
          pagination={bindMeta(meta)}
        />
      </div>
    </div>
  );
}
