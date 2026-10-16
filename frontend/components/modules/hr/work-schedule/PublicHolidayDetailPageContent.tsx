'use client';

import './public-holidays-v2.css';

import { useState } from 'react';
import { Button, Grid, Skeleton, Space } from 'antd';
import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  StopOutlined,
} from '@ant-design/icons';
import {
  ArrowLeft,
  CalendarDays,
  Bell,
  Globe2,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation, type EpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import type { HolidayNationality } from '@/lib/api/work-schedule.types';
import {
  useDeactivatePublicHoliday,
  useDeletePublicHoliday,
  usePublicHoliday,
  useUpdatePublicHoliday,
} from '@/lib/query/work-schedule';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';

const LIST_PATH = '/hr/public-holidays';

function appliesLabel(
  value: HolidayNationality,
  t: EpcTranslation['t'],
): string {
  if (value === 'ETHIOPIAN') {
    return t('hr.publicHoliday.ethiopianOnly');
  }
  if (value === 'CHINESE') {
    return t('hr.publicHoliday.chineseOnly');
  }
  return t('hr.publicHoliday.allEmployees');
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="erp-pro-card erp-ph-section-card">
      <div className="erp-employee-section">
        <div className="erp-employee-section-header">
          <h3 className="erp-employee-section-title">{title}</h3>
        </div>
        <div className="erp-employee-section-body">{children}</div>
      </div>
    </div>
  );
}

/**
 * Public holiday detail - leave / employees v2 hero and soft sections.
 */
export default function PublicHolidayDetailPageContent({
  holidayId,
}: {
  holidayId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isNarrow = screens.sm === false;
  const canViewHr = useCanViewHr();
  const holidayQuery = usePublicHoliday(holidayId, canViewHr);
  const deactivateMutation = useDeactivatePublicHoliday();
  const updateMutation = useUpdatePublicHoliday();
  const deleteMutation = useDeletePublicHoliday();
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const holiday = holidayQuery.data;

  useSetHeaderExtra(null);

  async function handleDeactivate(): Promise<void> {
    try {
      await deactivateMutation.mutateAsync(holidayId);
      messageApi.success(t('hr.publicHoliday.deactivated'));
      setConfirmDeactivate(false);
    } catch (error: unknown) {
      notifyApiError(error, t('hr.publicHoliday.saveFailed'), messageApi);
    }
  }

  async function handleDelete(): Promise<void> {
    try {
      await deleteMutation.mutateAsync(holidayId);
      messageApi.success(t('hr.publicHoliday.deleted'));
      setConfirmDelete(false);
      router.push(LIST_PATH);
    } catch (error: unknown) {
      notifyApiError(error, t('hr.publicHoliday.deleteFailed'), messageApi);
    }
  }

  async function handleReactivate(): Promise<void> {
    try {
      await updateMutation.mutateAsync({
        id: holidayId,
        payload: { isActive: true },
      });
      messageApi.success(t('hr.publicHoliday.reactivated'));
    } catch (error: unknown) {
      notifyApiError(error, t('hr.publicHoliday.saveFailed'), messageApi);
    }
  }

  function whenBadge(): React.ReactNode {
    if (!holiday) {
      return null;
    }
    if (holiday.isPast) {
      return (
        <StatusBadge label={t('hr.publicHoliday.passed')} variant="default" />
      );
    }
    if (holiday.daysUntil === 0) {
      return <StatusBadge label={t('hr.publicHoliday.today')} variant="orange" />;
    }
    return (
      <StatusBadge
        label={t('hr.publicHoliday.inDays', { days: holiday.daysUntil })}
        variant="info"
      />
    );
  }

  if (!canViewHr) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-ph-detail-page erp-public-holidays-v2">
        <ErpNotice tone="warning" title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  if (holidayQuery.isLoading && !holiday) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-ph-detail-page erp-public-holidays-v2">
        <div className="erp-ph-loading">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (holidayQuery.isError || !holiday) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-ph-detail-page erp-public-holidays-v2">
        <ErpNotice
          tone="error"
          title={getFriendlyApiErrorMessage(
            holidayQuery.error,
            t('hr.publicHoliday.loadError'),
            t,
          )}
          action={
            <Button onClick={() => router.push(LIST_PATH)}>
              {t('hr.publicHoliday.backToList')}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-ph-detail-page erp-public-holidays-v2">
      <ConfirmDialog
        open={confirmDeactivate}
        title={t('hr.publicHoliday.deactivateTitle')}
        description={t('hr.publicHoliday.deactivateDescription')}
        confirmLabel={t('hr.publicHoliday.deactivate')}
        danger
        confirmLoading={deactivateMutation.isPending}
        onConfirm={() => void handleDeactivate()}
        onCancel={() => setConfirmDeactivate(false)}
      />

      <ConfirmDialog
        open={confirmDelete}
        title={t('hr.publicHoliday.deleteTitle')}
        description={t('hr.publicHoliday.deleteDescription', {
          name: holiday.name,
        })}
        confirmLabel={t('hr.publicHoliday.delete')}
        danger
        confirmLoading={deleteMutation.isPending}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDelete(false)}
      />

      <section className="erp-ph-detail-hero">
        <div className="erp-ph-hero-top">
          <div className="min-w-0">
            <Link href={LIST_PATH} className="erp-ph-back">
              <ArrowLeft size={14} strokeWidth={2} aria-hidden />
              {t('hr.publicHoliday.backToList')}
            </Link>
            <div className="erp-ph-hero-identity">
              <span className="erp-ph-icon" aria-hidden>
                <CalendarDays size={22} strokeWidth={2} />
              </span>
              <div className="min-w-0">
                <div className="erp-ph-hero-title-row">
                  <h2 className="erp-ph-hero-title">{holiday.name}</h2>
                  <StatusBadge
                    label={
                      holiday.isActive
                        ? t('common.active')
                        : t('common.inactive')
                    }
                    variant={holiday.isActive ? 'success' : 'default'}
                  />
                  {whenBadge()}
                </div>
                <p className="erp-ph-detail-meta">
                  <span>
                    <CalendarDays size={14} strokeWidth={2} aria-hidden />
                    {formatProjectDate(holiday.date)}
                  </span>
                  <span>
                    <Globe2 size={14} strokeWidth={2} aria-hidden />
                    {appliesLabel(holiday.appliesToNationality, t)}
                  </span>
                  {holiday.nameZh ? <span>{holiday.nameZh}</span> : null}
                </p>
              </div>
            </div>
          </div>

          <div className="erp-ph-hero-actions">
            <Space.Compact>
              <Button
                type="primary"
                icon={<EditOutlined />}
                onClick={() => router.push(`${LIST_PATH}/${holiday.id}/edit`)}
                aria-label={t('common.update')}
              >
                {isNarrow ? undefined : t('common.update')}
              </Button>
              {holiday.isActive ? (
                <Button
                  danger
                  icon={<StopOutlined />}
                  onClick={() => setConfirmDeactivate(true)}
                  aria-label={t('hr.publicHoliday.deactivate')}
                >
                  {isNarrow ? undefined : t('hr.publicHoliday.deactivate')}
                </Button>
              ) : (
                <Button
                  icon={<CheckCircleOutlined />}
                  loading={updateMutation.isPending}
                  onClick={() => void handleReactivate()}
                  aria-label={t('hr.publicHoliday.reactivate')}
                >
                  {isNarrow ? undefined : t('hr.publicHoliday.reactivate')}
                </Button>
              )}
              <Button
                danger
                icon={<DeleteOutlined />}
                onClick={() => setConfirmDelete(true)}
                aria-label={t('hr.publicHoliday.delete')}
              >
                {isNarrow ? undefined : t('hr.publicHoliday.delete')}
              </Button>
            </Space.Compact>
          </div>
        </div>

        <div className="erp-ph-fact-row">
          <div className="erp-ph-fact">
            <p className="erp-ph-fact-label">{t('hr.publicHoliday.date')}</p>
            <p className="erp-ph-fact-value">
              {formatProjectDate(holiday.date)}
            </p>
          </div>
          <div className="erp-ph-fact">
            <p className="erp-ph-fact-label">{t('hr.publicHoliday.appliesTo')}</p>
            <p className="erp-ph-fact-value">
              {appliesLabel(holiday.appliesToNationality, t)}
            </p>
          </div>
          <div className="erp-ph-fact">
            <p className="erp-ph-fact-label">{t('hr.publicHoliday.recurring')}</p>
            <p className="erp-ph-fact-value">
              {holiday.isRecurring ? t('common.yes') : t('common.no')}
            </p>
          </div>
          <div className="erp-ph-fact">
            <p className="erp-ph-fact-label">
              {t('hr.publicHoliday.notifyDaysBefore')}
            </p>
            <p className="erp-ph-fact-value">{holiday.notifyDaysBefore}</p>
          </div>
        </div>
      </section>

      {!holiday.isActive ? (
        <ErpNotice
          tone="warning"
          className="mb-0"
          title={t('hr.publicHoliday.inactiveNotice')}
        />
      ) : null}

      <DetailSection title={t('hr.publicHoliday.details')}>
        <div className="erp-ph-details-grid">
          <div className="erp-ph-field">
            <p className="erp-ph-field-label">{t('hr.publicHoliday.name')}</p>
            <p className="erp-ph-field-value">{holiday.name}</p>
          </div>
          <div className="erp-ph-field">
            <p className="erp-ph-field-label">{t('hr.publicHoliday.nameZh')}</p>
            <p className="erp-ph-field-value">{holiday.nameZh || '-'}</p>
          </div>
          <div className="erp-ph-field">
            <p className="erp-ph-field-label">{t('hr.publicHoliday.date')}</p>
            <p className="erp-ph-field-value">
              {formatProjectDate(holiday.date)}
            </p>
          </div>
          <div className="erp-ph-field">
            <p className="erp-ph-field-label">{t('hr.publicHoliday.appliesTo')}</p>
            <p className="erp-ph-field-value">
              {appliesLabel(holiday.appliesToNationality, t)}
            </p>
          </div>
          <div className="erp-ph-field">
            <p className="erp-ph-field-label">{t('hr.publicHoliday.recurring')}</p>
            <p className="erp-ph-field-value">
              <span className="inline-flex items-center gap-1.5">
                <RefreshCw size={14} strokeWidth={2} aria-hidden />
                {holiday.isRecurring ? t('common.yes') : t('common.no')}
              </span>
            </p>
          </div>
          <div className="erp-ph-field">
            <p className="erp-ph-field-label">{t('common.status')}</p>
            <p className="erp-ph-field-value">
              <StatusBadge
                label={
                  holiday.isActive ? t('common.active') : t('common.inactive')
                }
                variant={holiday.isActive ? 'success' : 'default'}
              />
            </p>
          </div>
          <div className="erp-ph-field">
            <p className="erp-ph-field-label">
              {t('hr.publicHoliday.notifyDaysBefore')}
            </p>
            <p className="erp-ph-field-value">
              <span className="inline-flex items-center gap-1.5">
                <Bell size={14} strokeWidth={2} aria-hidden />
                {holiday.notifyDaysBefore}
              </span>
            </p>
          </div>
          <div className="erp-ph-field">
            <p className="erp-ph-field-label">{t('hr.publicHoliday.when')}</p>
            <p className="erp-ph-field-value">{whenBadge()}</p>
          </div>
          <div className="erp-ph-field">
            <p className="erp-ph-field-label">{t('hr.table.createdDate')}</p>
            <p className="erp-ph-field-value">
              {formatProjectDate(holiday.createdAt)}
            </p>
          </div>
          <div className="erp-ph-field">
            <p className="erp-ph-field-label">{t('hr.assetLabels.updatedAt')}</p>
            <p className="erp-ph-field-value">
              {formatProjectDate(holiday.updatedAt)}
            </p>
          </div>
          {holiday.notes ? (
            <div className="erp-ph-field erp-ph-field--wide">
              <p className="erp-ph-field-label">{t('hr.publicHoliday.notes')}</p>
              <p className="erp-ph-field-value">{holiday.notes}</p>
            </div>
          ) : null}
        </div>
      </DetailSection>
    </div>
  );
}
