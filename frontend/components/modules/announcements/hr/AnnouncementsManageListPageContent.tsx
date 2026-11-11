'use client';

import '../announcements.css';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, Button, Input, Segmented, Select, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { Pin } from 'lucide-react';
import { useCanManageAnnouncements, useIsSystemAdmin } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  AnnouncementStatus,
  AnnouncementType,
  ManagedAnnouncementListItem,
} from '@/lib/api/announcements.types';
import { useManagedAnnouncements } from '@/lib/query/announcements';
import {
  formatAnnouncementDate,
  formatAnnouncementDay,
  localized,
  priorityLabelKey,
  priorityTagStyle,
  scopeLabelKey,
  statusLabelKey,
  statusTagStyle,
} from '../announcement-display';

const STATUSES: AnnouncementStatus[] = ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'];

export function ReadProgress({
  read,
  acknowledged,
  recipients,
  requireAcknowledgement,
}: {
  read: number;
  acknowledged: number;
  recipients: number;
  requireAcknowledgement: boolean;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const percent = recipients > 0 ? Math.round((read / recipients) * 100) : 0;
  const label = requireAcknowledgement
    ? t('announcements.manage.progressAck', { read, total: recipients, acknowledged })
    : t('announcements.manage.progress', { read, total: recipients });
  return (
    <div className="erp-ann-progress">
      <div
        className="erp-ann-progress-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={label}
      >
        <div className="erp-ann-progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="erp-ann-progress-text">{label}</p>
    </div>
  );
}

/** HR / System Administrator list of every announcement. */
export default function AnnouncementsManageListPageContent({
  initialType = 'COMPANY',
}: {
  initialType?: AnnouncementType;
}): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const router = useRouter();
  const canManage = useCanManageAnnouncements();
  const isSystemAdmin = useIsSystemAdmin();
  const [type, setType] = useState<AnnouncementType>(
    initialType === 'SYSTEM_UPDATE' && isSystemAdmin ? 'SYSTEM_UPDATE' : 'COMPANY',
  );
  const [status, setStatus] = useState<AnnouncementStatus | undefined>();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const listQuery = useManagedAnnouncements(
    { type, status, search: search.trim() || undefined, page, limit: pageSize },
    canManage || isSystemAdmin,
  );

  const columns: ColumnsType<ManagedAnnouncementListItem> = useMemo(
    () => [
      {
        title: t('announcements.manage.columns.announcement'),
        key: 'title',
        render: (_, row) => (
          <div className="min-w-[220px]">
            <p className="m-0 flex flex-wrap items-center gap-2 font-semibold text-[#0f172a]">
              {localized(locale, row.title, row.titleZh)}
              {row.pinned ? (
                <span className="erp-ann-tag erp-ann-tag--pin">
                  <Pin size={11} strokeWidth={2.5} aria-hidden />
                  {t('announcements.list.pinned')}
                </span>
              ) : null}
              {row.priority !== 'NORMAL' ? (
                <span className="erp-ann-tag" style={priorityTagStyle(row.priority)}>
                  {t(priorityLabelKey(row.priority))}
                </span>
              ) : null}
            </p>
            <p className="m-0 mt-0.5 text-xs text-[#4b5563]">{row.number}</p>
          </div>
        ),
      },
      {
        title: t('announcements.manage.columns.status'),
        key: 'status',
        width: 150,
        render: (_, row) => (
          <div>
            <span className="erp-ann-tag" style={statusTagStyle(row.status)}>
              {t(statusLabelKey(row.status))}
            </span>
            {row.status === 'SCHEDULED' ? (
              <p className="m-0 mt-1 text-xs text-[#4b5563]">{formatAnnouncementDate(row.publishAt)}</p>
            ) : null}
          </div>
        ),
      },
      {
        title: t('announcements.manage.columns.audience'),
        key: 'audience',
        width: 170,
        responsive: ['md'],
        render: (_, row) => (
          <span className="text-[13px] text-[#1f2937]">
            {row.audienceScope === 'ALL'
              ? t(scopeLabelKey('ALL'))
              : t(`announcements.scopeCount.${row.audienceScope}`, { count: row.audienceSize })}
          </span>
        ),
      },
      {
        title: t('announcements.manage.columns.published'),
        key: 'publishedAt',
        width: 130,
        responsive: ['lg'],
        render: (_, row) => (
          <span className="text-[13px] text-[#4b5563]">{formatAnnouncementDay(row.publishedAt)}</span>
        ),
      },
      {
        title: t('announcements.manage.columns.reads'),
        key: 'reads',
        width: 230,
        render: (_, row) =>
          row.status === 'PUBLISHED' || row.status === 'ARCHIVED' ? (
            <ReadProgress
              read={row.stats.read}
              acknowledged={row.stats.acknowledged}
              recipients={row.stats.recipients}
              requireAcknowledgement={row.requireAcknowledgement}
            />
          ) : (
            <span className="text-[13px] text-[#6b7280]">-</span>
          ),
      },
    ],
    [locale, t],
  );

  if (!canManage && !isSystemAdmin) {
    return (
      <div className="erp-ann-page">
        <Alert type="warning" showIcon title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  return (
    <div className="erp-ann-page">
      <section className="erp-ann-card">
        <div className="erp-ann-toolbar">
          <h2 className="erp-ann-toolbar-title">
            {type === 'SYSTEM_UPDATE'
              ? t('announcements.manage.systemTitle')
              : t('announcements.manage.title')}
            <span className="erp-ann-count">
              {(listQuery.data?.meta.total ?? 0).toLocaleString()}
            </span>
          </h2>
          <div className="erp-ann-toolbar-actions">
            {isSystemAdmin ? (
              <Segmented<AnnouncementType>
                value={type}
                onChange={(value) => {
                  setType(value);
                  setPage(1);
                }}
                options={[
                  { value: 'COMPANY', label: t('announcements.type.COMPANY') },
                  { value: 'SYSTEM_UPDATE', label: t('announcements.type.SYSTEM_UPDATE') },
                ]}
              />
            ) : null}
            {(type === 'COMPANY' && canManage) || (type === 'SYSTEM_UPDATE' && isSystemAdmin) ? (
              <Link href={`/hr/announcements/new${type === 'SYSTEM_UPDATE' ? '?type=SYSTEM_UPDATE' : ''}`}>
                <Button type="primary" icon={<PlusOutlined />}>
                  {type === 'SYSTEM_UPDATE'
                    ? t('announcements.manage.newSystem')
                    : t('announcements.manage.new')}
                </Button>
              </Link>
            ) : null}
          </div>
        </div>

        <div className="erp-ann-filters">
          <Input
            allowClear
            className="erp-ann-search"
            prefix={<SearchOutlined />}
            placeholder={t('announcements.manage.search')}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          <Select
            allowClear
            placeholder={t('announcements.manage.columns.status')}
            value={status}
            onChange={(value: AnnouncementStatus | undefined) => {
              setStatus(value);
              setPage(1);
            }}
            options={STATUSES.map((value) => ({ value, label: t(statusLabelKey(value)) }))}
          />
        </div>

        {listQuery.isError ? (
          <div className="p-5">
            <Alert type="error" showIcon title={t('announcements.list.loadError')} />
          </div>
        ) : (
          <Table<ManagedAnnouncementListItem>
            rowKey="id"
            columns={columns}
            dataSource={listQuery.data?.data ?? []}
            loading={listQuery.isFetching}
            scroll={{ x: 760 }}
            onRow={(row) => ({
              onClick: () => router.push(`/hr/announcements/${row.id}`),
              style: { cursor: 'pointer' },
            })}
            locale={{ emptyText: t('announcements.manage.empty') }}
            pagination={{
              current: page,
              pageSize,
              total: listQuery.data?.meta.total ?? 0,
              showSizeChanger: false,
              onChange: setPage,
            }}
          />
        )}
      </section>
    </div>
  );
}
