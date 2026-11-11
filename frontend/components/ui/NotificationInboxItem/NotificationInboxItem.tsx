'use client';

import { Button, Tooltip, Typography } from 'antd';
import { CheckOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import type { InAppNotification } from '@/lib/api/documents.types';
import { notificationVisual } from '@/lib/utils/notification-display';
import { tokens } from '@/lib/theme/tokens';

dayjs.extend(relativeTime);

/**
 * Shared notification row for the header dropdown and full inbox page.
 */
export default function NotificationInboxItem({
  notification,
  onRead,
  onNavigate,
  markReadLabel,
  readLabel,
  unreadLabel,
  variant = 'panel',
  markReadLoading = false,
}: {
  notification: InAppNotification;
  onRead: (id: string) => void;
  onNavigate: (notification: InAppNotification) => void;
  markReadLabel: string;
  readLabel: string;
  unreadLabel: string;
  variant?: 'panel' | 'page';
  markReadLoading?: boolean;
}): React.ReactNode {
  const isUnread = !notification.readAt;
  const clickable = Boolean(notification.link);
  const visual = notificationVisual(notification);
  const isPage = variant === 'page';

  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onNavigate(notification);
              }
            }
          : undefined
      }
      onClick={clickable ? () => onNavigate(notification) : undefined}
      className={[
        'group relative flex items-start gap-3 px-4 py-3.5 transition-colors sm:px-5',
        isUnread ? 'bg-[#F7FCFA]' : 'bg-white',
        clickable ? 'cursor-pointer hover:bg-[var(--color-surface-secondary)]' : '',
      ].join(' ')}
    >
      {isUnread ? (
        <span
          className="absolute bottom-3 left-0 top-3 w-[3px] rounded-r-full"
          style={{ backgroundColor: tokens.colorPrimary }}
          aria-hidden
        />
      ) : null}

      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[16px] sm:h-9 sm:w-9 sm:text-[15px]"
        style={{ backgroundColor: visual.bg, color: visual.color }}
      >
        {visual.icon}
      </div>

      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-start justify-between gap-3">
          <p
            className={[
              'm-0 line-clamp-1 text-[13px] leading-snug sm:text-sm',
              isUnread
                ? 'font-semibold text-[var(--color-text-primary)]'
                : 'font-medium text-[var(--color-text-primary)]',
            ].join(' ')}
          >
            {notification.subject}
          </p>

          {isPage ? (
            <div className="flex shrink-0 items-center gap-2">
              {isUnread ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-teal-600)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-teal-400)]" />
                  {unreadLabel}
                </span>
              ) : (
                <span className="text-xs text-[var(--color-text-tertiary)]">
                  {readLabel}
                </span>
              )}
            </div>
          ) : isUnread ? (
            <Tooltip title={markReadLabel}>
              <button
                type="button"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--color-text-tertiary)] opacity-0 transition-all hover:bg-white hover:text-[var(--color-teal-600)] group-hover:opacity-100"
                onClick={(event) => {
                  event.stopPropagation();
                  onRead(notification.id);
                }}
                aria-label={markReadLabel}
              >
                <CheckOutlined style={{ fontSize: 12 }} />
              </button>
            </Tooltip>
          ) : null}
        </div>

        <Typography.Paragraph
          className="!mb-0 !mt-1 text-[12px] leading-relaxed text-[var(--color-text-secondary)] sm:text-[13px]"
          ellipsis={{ rows: 2 }}
        >
          {notification.body}
        </Typography.Paragraph>

        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-[11px] text-[var(--color-text-tertiary)] sm:text-xs">
            {dayjs(notification.createdAt).fromNow()}
          </span>
          {isPage && isUnread ? (
            <Button
              type="link"
              size="small"
              icon={<CheckOutlined />}
              loading={markReadLoading}
              className="!h-auto !px-0 !text-[12px]"
              style={{ color: tokens.colorPrimary }}
              onClick={(event) => {
                event.stopPropagation();
                onRead(notification.id);
              }}
            >
              {markReadLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
