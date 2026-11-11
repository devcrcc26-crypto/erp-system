'use client';

import '../announcements.css';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, Button, Input, Popconfirm, Segmented, Skeleton, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DownloadOutlined, SearchOutlined } from '@ant-design/icons';
import { ArrowLeft, BellRing, Pin } from 'lucide-react';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetBreadcrumbLabel } from '@/hooks/use-set-breadcrumb-label';
import type { AnnouncementRecipientRow } from '@/lib/api/announcements.types';
import {
  downloadAnnouncementStats,
  useAnnouncementRecipients,
  useArchiveAnnouncement,
  useDeleteAnnouncement,
  useManagedAnnouncement,
  usePublishAnnouncement,
  useRemindUnreadAnnouncement,
  useUnscheduleAnnouncement,
} from '@/lib/query/announcements';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatUserName } from '@/lib/utils/user-display';
import AnnouncementMarkdown from '../AnnouncementMarkdown';
import { AnnouncementAttachments } from '../AnnouncementDetailPageContent';
import {
  formatAnnouncementDate,
  localized,
  personName,
  priorityLabelKey,
  priorityTagStyle,
  scopeLabelKey,
  statusLabelKey,
  statusTagStyle,
} from '../announcement-display';
import { ReadProgress } from './AnnouncementsManageListPageContent';

type RecipientFilter = 'all' | 'unread' | 'unacknowledged';

export default function AnnouncementManageDetailPageContent({ id }: { id: string }): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const query = useManagedAnnouncement(id);
  const item = query.data;
  const [filter, setFilter] = useState<RecipientFilter>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const recipients = useAnnouncementRecipients(
    id,
    { filter, search: search.trim() || undefined, page, limit: 50 },
    Boolean(item && item.status !== 'DRAFT' && item.status !== 'SCHEDULED'),
  );

  const publish = usePublishAnnouncement();
  const unschedule = useUnscheduleAnnouncement();
  const archive = useArchiveAnnouncement();
  const remove = useDeleteAnnouncement();
  const remind = useRemindUnreadAnnouncement();

  useSetBreadcrumbLabel(item ? item.number : null);

  const columns: ColumnsType<AnnouncementRecipientRow> = useMemo(
    () => [
      {
        title: t('announcements.recipients.name'),
        key: 'name',
        render: (_, row) => (
          <div>
            <p className="m-0 font-semibold text-[#0f172a]">{formatUserName(row.user)}</p>
            <p className="m-0 text-xs text-[#4b5563]">{row.user.employeeId ?? '-'}</p>
          </div>
        ),
      },
      {
        title: t('announcements.recipients.department'),
        key: 'department',
        responsive: ['md'],
        render: (_, row) =>
          row.user.department ? localized(locale, row.user.department.name, row.user.department.nameZh) : '-',
      },
      {
        title: t('announcements.recipients.readAt'),
        key: 'readAt',
        width: 170,
        render: (_, row) =>
          row.readAt ? (
            formatAnnouncementDate(row.readAt)
          ) : (
            <span className="erp-ann-tag erp-ann-tag--muted">{t('announcements.recipients.notRead')}</span>
          ),
      },
      ...(item?.requireAcknowledgement
        ? [
            {
              title: t('announcements.recipients.acknowledgedAt'),
              key: 'acknowledgedAt',
              width: 170,
              render: (_: unknown, row: AnnouncementRecipientRow) =>
                row.acknowledgedAt ? (
                  formatAnnouncementDate(row.acknowledgedAt)
                ) : (
                  <span className="erp-ann-tag" style={priorityTagStyle('IMPORTANT')}>
                    {t('announcements.recipients.notAcknowledged')}
                  </span>
                ),
            },
          ]
        : []),
    ],
    [item?.requireAcknowledgement, locale, t],
  );

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
    return (
      <div className="erp-ann-page">
        <Alert type="error" showIcon title={t('announcements.detail.notFound')} />
      </div>
    );
  }

  const onError = (error: unknown) =>
    notifyApiError(error, t('announcements.form.saveFailed'), messageApi, t);
  const stats = item.stats;
  const isLive = item.status === 'PUBLISHED' || item.status === 'ARCHIVED';

  return (
    <div className="erp-ann-page">
      <article className="erp-ann-card erp-ann-detail">
        <Link href="/hr/announcements" className="erp-ann-back">
          <ArrowLeft size={14} strokeWidth={2} aria-hidden />
          {t('announcements.manage.title')}
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="erp-ann-tag" style={statusTagStyle(item.status)}>
                {t(statusLabelKey(item.status))}
              </span>
              <span className="erp-ann-tag erp-ann-tag--muted">{t(`announcements.type.${item.type}`)}</span>
              {item.priority !== 'NORMAL' ? (
                <span className="erp-ann-tag" style={priorityTagStyle(item.priority)}>
                  {t(priorityLabelKey(item.priority))}
                </span>
              ) : null}
              {item.pinned ? (
                <span className="erp-ann-tag erp-ann-tag--pin">
                  <Pin size={11} strokeWidth={2.5} aria-hidden />
                  {t('announcements.list.pinned')}
                </span>
              ) : null}
            </div>
            <h1 className="erp-ann-detail-title">{localized(locale, item.title, item.titleZh)}</h1>
            <p className="erp-ann-meta">
              <span>{item.number}</span>
              <span>{personName(item.creator)}</span>
              {item.contentEditedAt ? (
                <span>
                  {t('announcements.detail.edited', { date: formatAnnouncementDate(item.contentEditedAt) })}
                </span>
              ) : null}
            </p>
          </div>

          <div className="erp-ann-toolbar-actions">
            {item.permissions.canDelete ? (
              <Popconfirm
                title={t('announcements.manage.confirmDelete')}
                okText={t('common.delete')}
                okButtonProps={{ danger: true }}
                cancelText={t('common.cancel')}
                onConfirm={() =>
                  remove.mutate(item.id, {
                    onSuccess: () => {
                      messageApi.success(t('announcements.manage.deleted'));
                      router.push('/hr/announcements');
                    },
                    onError,
                  })
                }
              >
                <Button danger>{t('common.delete')}</Button>
              </Popconfirm>
            ) : null}
            {item.permissions.canArchive ? (
              <Popconfirm
                title={t('announcements.manage.confirmArchive')}
                description={t('announcements.manage.confirmArchiveHint')}
                okText={t('announcements.manage.archive')}
                cancelText={t('common.cancel')}
                onConfirm={() => archive.mutate(item.id, { onError })}
              >
                <Button loading={archive.isPending}>{t('announcements.manage.archive')}</Button>
              </Popconfirm>
            ) : null}
            {item.status === 'SCHEDULED' && item.permissions.canPublish ? (
              <Button loading={unschedule.isPending} onClick={() => unschedule.mutate(item.id, { onError })}>
                {t('announcements.manage.unschedule')}
              </Button>
            ) : null}
            {item.permissions.canEdit ? (
              <Link href={`/hr/announcements/${item.id}/edit`}>
                <Button>{t('announcements.manage.edit')}</Button>
              </Link>
            ) : null}
            {item.permissions.canPublish ? (
              <Popconfirm
                title={t('announcements.form.confirmPublish')}
                okText={t('announcements.form.publishNow')}
                cancelText={t('common.cancel')}
                onConfirm={() =>
                  publish.mutate(
                    { id: item.id },
                    {
                      onSuccess: (result) =>
                        messageApi.success(
                          t('announcements.form.publishedSuccess', { count: result.stats.recipients }),
                        ),
                      onError,
                    },
                  )
                }
              >
                <Button type="primary" loading={publish.isPending}>
                  {t('announcements.form.publishNow')}
                </Button>
              </Popconfirm>
            ) : null}
          </div>
        </div>

        <div className="erp-ann-facts">
          <div className="erp-ann-fact">
            <p>{t('announcements.form.audience')}</p>
            <p>
              {item.audienceScope === 'ALL'
                ? t(scopeLabelKey('ALL'))
                : item.audienceLabels.join(', ') || t(scopeLabelKey(item.audienceScope))}
            </p>
          </div>
          <div className="erp-ann-fact">
            <p>
              {item.status === 'SCHEDULED'
                ? t('announcements.form.publishAt')
                : t('announcements.manage.columns.published')}
            </p>
            <p>{formatAnnouncementDate(item.status === 'SCHEDULED' ? item.publishAt : item.publishedAt)}</p>
          </div>
          <div className="erp-ann-fact">
            <p>{t('announcements.form.expiresAt')}</p>
            <p>{item.expiresAt ? formatAnnouncementDate(item.expiresAt) : t('announcements.manage.never')}</p>
          </div>
          <div className="erp-ann-fact">
            <p>{t('announcements.manage.delivery')}</p>
            <p>
              {[
                item.requireAcknowledgement ? t('announcements.form.requireAck') : null,
                item.sendEmail ? t('announcements.form.sendEmail') : null,
              ]
                .filter(Boolean)
                .join(' · ') || t('announcements.manage.inAppOnly')}
            </p>
          </div>
        </div>

        <div className="erp-ann-detail-body">
          <AnnouncementMarkdown source={localized(locale, item.body, item.bodyZh)} />
        </div>
        <AnnouncementAttachments announcementId={item.id} attachments={item.attachments} scope="managed" />
      </article>

      {isLive ? (
        <section className="erp-ann-card">
          <div className="erp-ann-toolbar">
            <h2 className="erp-ann-toolbar-title">{t('announcements.recipients.title')}</h2>
            <div className="erp-ann-toolbar-actions">
              {item.permissions.canRemind ? (
                <Popconfirm
                  title={t('announcements.manage.confirmRemind', {
                    count: stats.recipients - stats.read,
                  })}
                  okText={t('announcements.manage.remind')}
                  cancelText={t('common.cancel')}
                  disabled={stats.recipients - stats.read === 0}
                  onConfirm={() =>
                    remind.mutate(item.id, {
                      onSuccess: (result) =>
                        messageApi.success(
                          t('announcements.manage.reminded', { count: result.notified }),
                        ),
                      onError,
                    })
                  }
                >
                  <Button
                    icon={<BellRing size={14} strokeWidth={2} />}
                    loading={remind.isPending}
                    disabled={stats.recipients - stats.read === 0}
                  >
                    {t('announcements.manage.remind')}
                  </Button>
                </Popconfirm>
              ) : null}
              {item.permissions.canExport ? (
                <Button
                  icon={<DownloadOutlined />}
                  loading={exporting}
                  onClick={() => {
                    setExporting(true);
                    void downloadAnnouncementStats(item.id, item.number)
                      .catch((error) => notifyApiError(error, t('announcements.manage.exportFailed'), messageApi, t))
                      .finally(() => setExporting(false));
                  }}
                >
                  {t('announcements.manage.export')}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="px-5 pb-4">
            <div className="erp-ann-stats">
              <div className="erp-ann-stat">
                <p className="erp-ann-stat-label">{t('announcements.recipients.total')}</p>
                <p className="erp-ann-stat-value">{stats.recipients}</p>
              </div>
              <div className="erp-ann-stat">
                <p className="erp-ann-stat-label">{t('announcements.recipients.read')}</p>
                <p className="erp-ann-stat-value">
                  {stats.read}
                  <small>
                    {stats.recipients > 0 ? `${Math.round((stats.read / stats.recipients) * 100)}%` : '-'}
                  </small>
                </p>
              </div>
              <div className="erp-ann-stat">
                <p className="erp-ann-stat-label">{t('announcements.recipients.acknowledged')}</p>
                <p className="erp-ann-stat-value">
                  {item.requireAcknowledgement ? stats.acknowledged : '-'}
                  {item.requireAcknowledgement && stats.recipients > 0 ? (
                    <small>{`${Math.round((stats.acknowledged / stats.recipients) * 100)}%`}</small>
                  ) : null}
                </p>
              </div>
            </div>
            <div className="mt-3">
              <ReadProgress
                read={stats.read}
                acknowledged={stats.acknowledged}
                recipients={stats.recipients}
                requireAcknowledgement={item.requireAcknowledgement}
              />
            </div>
          </div>

          <div className="erp-ann-filters">
            <Segmented<RecipientFilter>
              value={filter}
              onChange={(value) => {
                setFilter(value);
                setPage(1);
              }}
              options={[
                { value: 'all', label: t('announcements.recipients.filterAll') },
                { value: 'unread', label: t('announcements.recipients.filterUnread') },
                ...(item.requireAcknowledgement
                  ? [{ value: 'unacknowledged' as const, label: t('announcements.recipients.filterUnacknowledged') }]
                  : []),
              ]}
            />
            <Input
              allowClear
              className="erp-ann-search"
              prefix={<SearchOutlined />}
              placeholder={t('announcements.recipients.search')}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>

          <Table<AnnouncementRecipientRow>
            rowKey="id"
            columns={columns}
            dataSource={recipients.data?.data ?? []}
            loading={recipients.isFetching}
            scroll={{ x: 640 }}
            locale={{ emptyText: t('announcements.recipients.empty') }}
            pagination={{
              current: page,
              pageSize: 50,
              total: recipients.data?.meta.total ?? 0,
              showSizeChanger: false,
              onChange: setPage,
            }}
          />
        </section>
      ) : null}
    </div>
  );
}
