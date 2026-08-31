'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Pagination, Segmented, Spin } from 'antd';
import {
  BellOutlined,
  CheckCircleOutlined,
  MailOutlined,
} from '@ant-design/icons';
import NotificationInboxItem from '@/components/ui/NotificationInboxItem/NotificationInboxItem';
import KPICard from '@/components/ui/KPICard/KPICard';
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
import { tokens } from '@/lib/theme/tokens';

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
  const pagination = bindMeta(meta);

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

  const readCount = Math.max(0, (meta?.total ?? 0) - unreadCount);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <KPICard
          label={t('pages.notifications.stats.total')}
          value={String(meta?.total ?? 0)}
          icon={BellOutlined}
          iconBg={tokens.colorTeal50}
          iconColor={tokens.colorTeal400}
        />
        <KPICard
          label={t('pages.notifications.stats.unread')}
          value={String(unreadCount)}
          icon={MailOutlined}
          iconBg={tokens.colorAmber50}
          iconColor={tokens.colorAmber400}
        />
        <KPICard
          label={t('pages.notifications.stats.read')}
          value={String(readCount)}
          icon={CheckCircleOutlined}
          iconBg={tokens.colorBlue50}
          iconColor={tokens.colorBlue400}
        />
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-4 py-3"
        style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
      >
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
              type="primary"
              loading={markAllRead.isPending}
              onClick={() => void handleMarkAllRead()}
              style={{
                backgroundColor: tokens.colorPrimary,
              }}
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

      <div className="overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        {listQuery.isFetching && !rows.length ? (
          <div className="flex justify-center py-16">
            <Spin />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <div
              className="mb-4 flex h-14 w-14 items-center justify-center rounded-full"
              style={{
                backgroundColor: tokens.colorGray50,
                color: tokens.colorTextTertiary,
              }}
            >
              <BellOutlined style={{ fontSize: 24 }} />
            </div>
            <p
              className="m-0 text-base font-semibold"
              style={{ color: tokens.colorTextPrimary }}
            >
              {filter === 'unread'
                ? t('pages.notifications.emptyUnread')
                : t('pages.notifications.empty')}
            </p>
            <p
              className="m-0 mt-2 max-w-sm text-sm"
              style={{ color: tokens.colorTextSecondary }}
            >
              {filter === 'unread'
                ? t('pages.notifications.emptyUnreadHint')
                : t('pages.notifications.emptyHint')}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[rgba(0,0,0,0.05)]">
            {rows.map((notification) => (
              <NotificationInboxItem
                key={notification.id}
                notification={notification}
                variant="page"
                markReadLoading={
                  markRead.isPending && markRead.variables === notification.id
                }
                onRead={(id) => void handleMarkRead(id)}
                onNavigate={handleOpen}
                markReadLabel={t('pages.notifications.markRead')}
                readLabel={t('pages.notifications.read')}
                unreadLabel={t('pages.notifications.unread')}
              />
            ))}
          </div>
        )}

        {pagination && rows.length > 0 ? (
          <div className="flex justify-end border-t border-[rgba(0,0,0,0.06)] px-4 py-3 sm:px-5">
            <Pagination
              current={pagination.current}
              pageSize={pagination.pageSize}
              total={pagination.total}
              showSizeChanger={pagination.showSizeChanger}
              pageSizeOptions={pagination.pageSizeOptions}
              showTotal={pagination.showTotal}
              onChange={pagination.onChange}
              onShowSizeChange={pagination.onShowSizeChange}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
