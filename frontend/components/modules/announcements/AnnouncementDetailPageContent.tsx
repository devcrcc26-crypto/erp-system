'use client';

import './announcements.css';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Alert, Button, Skeleton } from 'antd';
import { ArrowLeft, CheckCircle2, Paperclip, Pin } from 'lucide-react';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetBreadcrumbLabel } from '@/hooks/use-set-breadcrumb-label';
import { ApiRequestError } from '@/lib/api/errors';
import type { AnnouncementAttachment } from '@/lib/api/announcements.types';
import {
  openAnnouncementAttachment,
  useAcknowledgeAnnouncement,
  useMarkAnnouncementRead,
  useMyAnnouncement,
} from '@/lib/query/announcements';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import AnnouncementMarkdown from './AnnouncementMarkdown';
import {
  formatAnnouncementDate,
  formatFileSize,
  localized,
  personName,
  priorityLabelKey,
  priorityTagStyle,
} from './announcement-display';

export function AnnouncementAttachments({
  announcementId,
  attachments,
  scope = 'mine',
}: {
  announcementId: string;
  attachments: AnnouncementAttachment[];
  scope?: 'mine' | 'managed';
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  if (attachments.length === 0) {
    return null;
  }
  return (
    <div className="mt-6">
      <p className="erp-ann-section-title">{t('announcements.detail.attachments')}</p>
      <ul className="erp-ann-attachments">
        {attachments.map((file) => (
          <li key={file.id}>
            <button
              type="button"
              className="erp-ann-attachment"
              onClick={() => {
                void openAnnouncementAttachment(announcementId, file.id, scope).catch((error) =>
                  notifyApiError(error, t('announcements.detail.downloadFailed'), messageApi, t),
                );
              }}
            >
              <Paperclip size={15} strokeWidth={2} aria-hidden />
              <span className="erp-ann-attachment-name">{file.name}</span>
              <span className="erp-ann-attachment-size">{formatFileSize(file.fileSizeBytes)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One received announcement. Opening it marks it read; posts that ask for an
 * acknowledgement show "I have read and understood".
 */
export default function AnnouncementDetailPageContent({ id }: { id: string }): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const messageApi = useAppMessage();
  const query = useMyAnnouncement(id);
  const markRead = useMarkAnnouncementRead();
  const acknowledge = useAcknowledgeAnnouncement();
  const markedRef = useRef(false);
  const item = query.data;
  const backHref = item?.type === 'SYSTEM_UPDATE' ? '/whats-new' : '/announcements';

  useSetBreadcrumbLabel(item ? localized(locale, item.title, item.titleZh) : null);

  useEffect(() => {
    if (item && !item.readAt && !markedRef.current) {
      markedRef.current = true;
      markRead.mutate(item.id);
    }
  }, [item, markRead]);

  if (query.isLoading) {
    return (
      <div className="erp-ann-page">
        <section className="erp-ann-card erp-ann-detail">
          <Skeleton active paragraph={{ rows: 8 }} />
        </section>
      </div>
    );
  }

  if (query.isError || !item) {
    const status = query.error instanceof ApiRequestError ? query.error.status : undefined;
    return (
      <div className="erp-ann-page">
        <section className="erp-ann-card erp-ann-detail">
          <Link href="/announcements" className="erp-ann-back">
            <ArrowLeft size={14} strokeWidth={2} aria-hidden />
            {t('announcements.list.title')}
          </Link>
          <Alert
            type={status === 403 ? 'warning' : 'error'}
            showIcon
            title={
              status === 403
                ? t('announcements.detail.notRecipient')
                : t('announcements.detail.notFound')
            }
          />
        </section>
      </div>
    );
  }

  const acknowledged = Boolean(item.acknowledgedAt);

  return (
    <div className="erp-ann-page">
      <article className="erp-ann-card erp-ann-detail">
        <Link href={backHref} className="erp-ann-back">
          <ArrowLeft size={14} strokeWidth={2} aria-hidden />
          {item.type === 'SYSTEM_UPDATE'
            ? t('announcements.whatsNew.title')
            : t('announcements.list.title')}
        </Link>

        <div className="flex flex-wrap items-center gap-2">
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
          {item.isExpired ? (
            <span className="erp-ann-tag erp-ann-tag--muted">{t('announcements.list.expired')}</span>
          ) : null}
        </div>

        <h1 className="erp-ann-detail-title">{localized(locale, item.title, item.titleZh)}</h1>
        <p className="erp-ann-meta">
          <span>{personName(item.author)}</span>
          <span>{formatAnnouncementDate(item.publishedAt)}</span>
          {item.contentEditedAt ? (
            <span>
              {t('announcements.detail.edited', {
                date: formatAnnouncementDate(item.contentEditedAt),
              })}
            </span>
          ) : null}
        </p>

        <div className="erp-ann-detail-body">
          <AnnouncementMarkdown source={localized(locale, item.body, item.bodyZh)} />
        </div>

        <AnnouncementAttachments announcementId={item.id} attachments={item.attachments} />

        {item.requireAcknowledgement ? (
          <div className={`erp-ann-ack${acknowledged ? ' erp-ann-ack--done' : ''}`}>
            {acknowledged ? (
              <p className="flex items-center gap-2">
                <CheckCircle2 size={18} strokeWidth={2} aria-hidden />
                {t('announcements.ack.doneOn', {
                  date: formatAnnouncementDate(item.acknowledgedAt),
                })}
              </p>
            ) : (
              <>
                <p>{t('announcements.ack.prompt')}</p>
                <Button
                  type="primary"
                  loading={acknowledge.isPending}
                  onClick={() => {
                    acknowledge.mutate(item.id, {
                      onSuccess: () => messageApi.success(t('announcements.ack.success')),
                      onError: (error) =>
                        notifyApiError(error, t('announcements.ack.failed'), messageApi, t),
                    });
                  }}
                >
                  {t('announcements.ack.button')}
                </Button>
              </>
            )}
          </div>
        ) : null}
      </article>
    </div>
  );
}
