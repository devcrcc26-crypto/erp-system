'use client';

import { useState } from 'react';
import { Button, Dropdown, Grid, Skeleton } from 'antd';
import type { MenuProps } from 'antd';
import { MoreOutlined } from '@ant-design/icons';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { MetaItem } from '@/components/modules/hr/shared/hr-page-chrome';
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
    <div className="erp-employee-section">
      <div className="erp-employee-section-header">
        <h3 className="erp-employee-section-title m-0">{title}</h3>
      </div>
      <div className="erp-employee-section-body">{children}</div>
    </div>
  );
}

/**
 * Public holiday detail — date, nationality, recurring, notification.
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
  const isCompact = screens.md === false;
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
      <div className="erp-pro-list-page erp-users-page erp-employee-detail-page">
        <ErpNotice tone="warning" title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  if (holidayQuery.isLoading && !holiday) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-detail-page">
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (holidayQuery.isError || !holiday) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-detail-page">
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

  const overflowMenuItems: MenuProps['items'] = [
    {
      key: 'edit',
      label: t('common.update'),
      icon: <Pencil size={14} />,
      onClick: () => router.push(`${LIST_PATH}/${holiday.id}/edit`),
    },
    holiday.isActive
      ? {
          key: 'deactivate',
          label: t('hr.publicHoliday.deactivate'),
          danger: true,
          onClick: () => setConfirmDeactivate(true),
        }
      : {
          key: 'reactivate',
          label: t('hr.publicHoliday.reactivate'),
          onClick: () => void handleReactivate(),
        },
    { type: 'divider' },
    {
      key: 'delete',
      label: t('hr.publicHoliday.delete'),
      icon: <Trash2 size={14} />,
      danger: true,
      onClick: () => setConfirmDelete(true),
    },
  ];

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-detail-page">
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

      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-employee-toolbar">
          <div className="erp-employee-toolbar-back flex min-w-0 items-center gap-2">
            <Button
              type="text"
              icon={<ArrowLeft size={16} />}
              onClick={() => router.push(LIST_PATH)}
              aria-label={t('hr.buttons.back')}
            >
              {isNarrow ? undefined : t('hr.buttons.back')}
            </Button>
          </div>
          <div className="erp-employee-toolbar-actions flex flex-wrap items-center justify-end gap-2">
            {isNarrow ? (
              <Dropdown menu={{ items: overflowMenuItems }} trigger={['click']}>
                <Button
                  icon={<MoreOutlined />}
                  aria-label={t('common.actions')}
                />
              </Dropdown>
            ) : (
              <>
                <Button
                  type="primary"
                  icon={<Pencil size={14} />}
                  onClick={() =>
                    router.push(`${LIST_PATH}/${holiday.id}/edit`)
                  }
                >
                  {isCompact ? undefined : t('common.update')}
                </Button>
                {holiday.isActive ? (
                  <Button danger onClick={() => setConfirmDeactivate(true)}>
                    {isCompact ? undefined : t('hr.publicHoliday.deactivate')}
                  </Button>
                ) : (
                  <Button
                    loading={updateMutation.isPending}
                    onClick={() => void handleReactivate()}
                  >
                    {isCompact ? undefined : t('hr.publicHoliday.reactivate')}
                  </Button>
                )}
                <Button
                  danger
                  icon={<Trash2 size={14} />}
                  onClick={() => setConfirmDelete(true)}
                  aria-label={t('hr.publicHoliday.delete')}
                >
                  {isCompact ? undefined : t('hr.publicHoliday.delete')}
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="erp-employee-hero erp-contract-hero">
          <div className="erp-employee-hero-copy min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <StatusBadge
                label={
                  holiday.isActive ? t('common.active') : t('common.inactive')
                }
                variant={holiday.isActive ? 'success' : 'default'}
              />
              {whenBadge()}
            </div>
            <h2 className="erp-users-name erp-employee-hero-name m-0 break-words">
              {holiday.name}
            </h2>
            <p className="erp-users-email m-0 mt-1.5 break-words sm:text-left">
              {holiday.nameZh || formatProjectDate(holiday.date)}
            </p>
          </div>
        </div>
      </div>

      <div className="erp-users-stat-bar erp-employee-meta-bar erp-contract-meta-bar">
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.publicHoliday.date')}</p>
            <p className="erp-employee-meta-value">
              {formatProjectDate(holiday.date)}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">
              {t('hr.publicHoliday.appliesTo')}
            </p>
            <p className="erp-employee-meta-value truncate">
              {appliesLabel(holiday.appliesToNationality, t)}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">
              {t('hr.publicHoliday.recurring')}
            </p>
            <p className="erp-employee-meta-value">
              {holiday.isRecurring ? t('common.yes') : t('common.no')}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">
              {t('hr.publicHoliday.notifyDaysBefore')}
            </p>
            <p className="erp-employee-meta-value">{holiday.notifyDaysBefore}</p>
          </div>
        </div>
      </div>

      {!holiday.isActive ? (
        <ErpNotice
          tone="warning"
          className="mb-0"
          title={t('hr.publicHoliday.inactiveNotice')}
        />
      ) : null}

      <div className="erp-pro-card min-w-0 overflow-hidden">
        <div className="erp-employee-tab-panel erp-contract-detail-body">
          <DetailSection title={t('hr.publicHoliday.details')}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <MetaItem label={t('hr.publicHoliday.name')}>{holiday.name}</MetaItem>
              <MetaItem label={t('hr.publicHoliday.nameZh')}>
                {holiday.nameZh || '—'}
              </MetaItem>
              <MetaItem label={t('hr.publicHoliday.date')}>
                {formatProjectDate(holiday.date)}
              </MetaItem>
              <MetaItem label={t('hr.publicHoliday.appliesTo')}>
                {appliesLabel(holiday.appliesToNationality, t)}
              </MetaItem>
              <MetaItem label={t('hr.publicHoliday.recurring')}>
                {holiday.isRecurring ? t('common.yes') : t('common.no')}
              </MetaItem>
              <MetaItem label={t('common.status')}>
                <StatusBadge
                  label={
                    holiday.isActive ? t('common.active') : t('common.inactive')
                  }
                  variant={holiday.isActive ? 'success' : 'default'}
                />
              </MetaItem>
              <MetaItem label={t('hr.table.createdDate')}>
                {formatProjectDate(holiday.createdAt)}
              </MetaItem>
              <MetaItem label={t('hr.assetLabels.updatedAt')}>
                {formatProjectDate(holiday.updatedAt)}
              </MetaItem>
              {holiday.notes ? (
                <div className="md:col-span-2">
                  <MetaItem label={t('hr.publicHoliday.notes')}>
                    <span className="whitespace-pre-wrap">{holiday.notes}</span>
                  </MetaItem>
                </div>
              ) : null}
            </div>
          </DetailSection>
        </div>
      </div>
    </div>
  );
}
