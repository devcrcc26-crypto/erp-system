'use client';

import './announcements.css';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button, Modal } from 'antd';
import { BellRing, Sparkles, X } from 'lucide-react';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  useAcknowledgeAnnouncement,
  useAnnouncementsSummary,
  useMarkAnnouncementsRead,
} from '@/lib/query/announcements';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useAuthStore } from '@/stores/auth.store';
import AnnouncementMarkdown from './AnnouncementMarkdown';
import { AnnouncementAttachments } from './AnnouncementDetailPageContent';
import { formatAnnouncementDay, localized, personName } from './announcement-display';

const DISMISSED_KEY = 'erp.announcements.bannerDismissed';

function readDismissed(): string[] {
  try {
    const raw = window.sessionStorage.getItem(DISMISSED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeDismissed(ids: string[]): void {
  try {
    window.sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(ids));
  } catch {
    // Storage blocked: the banner simply comes back on the next page load.
  }
}

/**
 * Red banner for unread, unexpired URGENT announcements. Dismissing hides it
 * for this browser session; it returns next session until the post is opened.
 */
export function UrgentAnnouncementBanner(): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const pathname = usePathname();
  const ready = useAuthStore((state) => state.capabilitiesReady);
  const summary = useAnnouncementsSummary(ready);
  // The banner only renders once the summary has loaded on the client, so
  // reading sessionStorage up front can't cause a hydration mismatch.
  const [dismissed, setDismissed] = useState<string[]>(() =>
    typeof window === 'undefined' ? [] : readDismissed(),
  );

  const visible = useMemo(
    () =>
      (summary.data?.urgent ?? []).filter(
        (item) => !dismissed.includes(item.id) && pathname !== `/announcements/${item.id}`,
      ),
    [summary.data?.urgent, dismissed, pathname],
  );

  const first = visible[0];
  if (!first) {
    return null;
  }

  return (
    <div className="erp-ann-banner" role="alert">
      <BellRing className="erp-ann-banner-icon" size={18} strokeWidth={2} aria-hidden />
      <p className="erp-ann-banner-text m-0">
        <span className="erp-ann-banner-label">{t('announcements.banner.label')}</span>
        <span className="erp-ann-banner-title">{localized(locale, first.title, first.titleZh)}</span>
        {visible.length > 1 ? (
          <span className="erp-ann-banner-more">
            {t('announcements.banner.more', { count: visible.length - 1 })}
          </span>
        ) : null}
      </p>
      <Link href={`/announcements/${first.id}`} className="erp-ann-banner-open">
        {t('announcements.banner.open')}
      </Link>
      <button
        type="button"
        className="erp-ann-banner-close"
        aria-label={t('announcements.banner.dismiss')}
        onClick={() => {
          const next = [...dismissed, ...visible.map((item) => item.id)];
          setDismissed(next);
          writeDismissed(next);
        }}
      >
        <X size={16} strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}

/**
 * Login-time modals: URGENT posts that need an acknowledgement (cannot be
 * closed until acknowledged), then unread system updates as "What's new"
 * (newest first, Next / Got it; closing marks them read).
 */
export function AnnouncementModals(): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const messageApi = useAppMessage();
  const ready = useAuthStore((state) => state.capabilitiesReady);
  const summary = useAnnouncementsSummary(ready);
  const acknowledge = useAcknowledgeAnnouncement();
  const markRead = useMarkAnnouncementsRead();
  const [whatsNewIndex, setWhatsNewIndex] = useState(0);
  const [whatsNewClosed, setWhatsNewClosed] = useState(false);

  const pendingAck = summary.data?.pendingAcknowledgement ?? [];
  const whatsNew = summary.data?.whatsNew ?? [];
  const ackItem = pendingAck[0];

  if (ackItem) {
    return (
      <Modal
        open
        centered
        closable={false}
        mask={{ closable: false }}
        keyboard={false}
        footer={null}
        width={640}
        className="erp-ann-modal"
        title={null}
      >
        <p className="erp-ann-modal-kicker">
          <BellRing size={14} strokeWidth={2.5} aria-hidden />
          {t('announcements.ackModal.kicker')}
        </p>
        <h2 className="erp-ann-modal-title">{localized(locale, ackItem.title, ackItem.titleZh)}</h2>
        <p className="erp-ann-meta">
          <span>{personName(ackItem.author)}</span>
          <span>{formatAnnouncementDay(ackItem.publishedAt)}</span>
        </p>
        <div className="erp-ann-modal-body">
          <AnnouncementMarkdown source={localized(locale, ackItem.body, ackItem.bodyZh)} />
          <AnnouncementAttachments announcementId={ackItem.id} attachments={ackItem.attachments} />
        </div>
        <div className="erp-ann-modal-footer">
          <span className="erp-ann-pager">
            {pendingAck.length > 1
              ? t('announcements.ackModal.remaining', { count: pendingAck.length })
              : null}
          </span>
          <Button
            type="primary"
            size="large"
            loading={acknowledge.isPending}
            onClick={() =>
              acknowledge.mutate(ackItem.id, {
                onError: (error) =>
                  notifyApiError(error, t('announcements.ack.failed'), messageApi, t),
              })
            }
          >
            {t('announcements.ack.button')}
          </Button>
        </div>
      </Modal>
    );
  }

  if (whatsNew.length === 0 || whatsNewClosed) {
    return null;
  }

  const index = Math.min(whatsNewIndex, whatsNew.length - 1);
  const item = whatsNew[index];
  const isLast = index === whatsNew.length - 1;

  function close(): void {
    setWhatsNewClosed(true);
    markRead.mutate(whatsNew.map((entry) => entry.id));
  }

  return (
    <Modal
      open
      centered
      onCancel={close}
      footer={null}
      width={600}
      className="erp-ann-modal"
      title={null}
    >
      <p className="erp-ann-modal-kicker erp-ann-modal-kicker--new">
        <Sparkles size={14} strokeWidth={2.5} aria-hidden />
        {t('announcements.whatsNew.title')}
      </p>
      <h2 className="erp-ann-modal-title">{localized(locale, item.title, item.titleZh)}</h2>
      <p className="erp-ann-meta">
        <span>{formatAnnouncementDay(item.publishedAt)}</span>
      </p>
      <div className="erp-ann-modal-body">
        <AnnouncementMarkdown source={localized(locale, item.body, item.bodyZh)} />
      </div>
      <div className="erp-ann-modal-footer">
        <span className="erp-ann-pager">
          {whatsNew.length > 1
            ? t('announcements.whatsNew.pager', { current: index + 1, total: whatsNew.length })
            : null}
        </span>
        <div className="flex gap-2">
          {index > 0 ? (
            <Button onClick={() => setWhatsNewIndex(index - 1)}>{t('common.back')}</Button>
          ) : null}
          {isLast ? (
            <Button type="primary" onClick={close}>
              {t('announcements.whatsNew.gotIt')}
            </Button>
          ) : (
            <Button type="primary" onClick={() => setWhatsNewIndex(index + 1)}>
              {t('announcements.whatsNew.next')}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
