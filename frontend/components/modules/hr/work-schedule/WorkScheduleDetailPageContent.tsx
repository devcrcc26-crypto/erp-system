'use client';

import { useState } from 'react';
import { Button, Dropdown, Grid, Skeleton, Tag } from 'antd';
import type { MenuProps } from 'antd';
import { MoreOutlined } from '@ant-design/icons';
import { ArrowLeft, Pencil, Star, Trash2, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import AssignWorkScheduleModal from '@/components/modules/hr/work-schedule/AssignWorkScheduleModal';
import WorkScheduleWeekGrid from '@/components/modules/hr/work-schedule/WorkScheduleWeekGrid';
import { MetaItem } from '@/components/modules/hr/shared/hr-page-chrome';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import {
  useDeactivateWorkSchedule,
  useDeleteWorkSchedule,
  useSetDefaultWorkSchedule,
  useWorkSchedule,
} from '@/lib/query/work-schedule';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';

import { DETAIL_PAGE_V2 } from '@/components/ui/list-page-v2';
const LIST_PATH = '/hr/work-schedules';

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="erp-employee-section">
      <div className="erp-employee-section-header flex flex-wrap items-center justify-between gap-2">
        <h3 className="erp-employee-section-title m-0">{title}</h3>
      </div>
      <div className="erp-employee-section-body">{children}</div>
    </div>
  );
}

/**
 * Work schedule detail - week pattern, default/active, assignment count.
 */
export default function WorkScheduleDetailPageContent({
  scheduleId,
}: {
  scheduleId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;
  const canViewHr = useCanViewHr();
  const scheduleQuery = useWorkSchedule(scheduleId, canViewHr);
  const deactivateMutation = useDeactivateWorkSchedule();
  const deleteMutation = useDeleteWorkSchedule();
  const defaultMutation = useSetDefaultWorkSchedule();
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const schedule = scheduleQuery.data;

  useSetHeaderExtra(null);

  async function handleDeactivate(): Promise<void> {
    try {
      await deactivateMutation.mutateAsync(scheduleId);
      messageApi.success(t('hr.workSchedule.deactivated'));
      setConfirmDeactivate(false);
    } catch (error: unknown) {
      notifyApiError(error, t('hr.workSchedule.saveFailed'), messageApi);
    }
  }

  async function handleDelete(): Promise<void> {
    try {
      const result = await deleteMutation.mutateAsync(scheduleId);
      messageApi.success(
        t('hr.workSchedule.deleted', {
          count: result.movedEmployees,
          schedule: result.defaultScheduleName,
        }),
      );
      setConfirmDelete(false);
      router.push(LIST_PATH);
    } catch (error: unknown) {
      notifyApiError(error, t('hr.workSchedule.deleteFailed'), messageApi);
    }
  }

  async function handleSetDefault(): Promise<void> {
    try {
      await defaultMutation.mutateAsync(scheduleId);
      messageApi.success(t('hr.workSchedule.defaultUpdated'));
    } catch (error: unknown) {
      notifyApiError(error, t('hr.workSchedule.saveFailed'), messageApi);
    }
  }

  if (!canViewHr) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-employee-detail-page ${DETAIL_PAGE_V2}`}>
        <ErpNotice tone="warning" title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  if (scheduleQuery.isLoading && !schedule) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-employee-detail-page ${DETAIL_PAGE_V2}`}>
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (scheduleQuery.isError || !schedule) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-employee-detail-page ${DETAIL_PAGE_V2}`}>
        <ErpNotice
          tone="error"
          title={getFriendlyApiErrorMessage(
            scheduleQuery.error,
            t('hr.workSchedule.loadError'),
            t,
          )}
          action={
            <Button onClick={() => router.push(LIST_PATH)}>
              {t('hr.workSchedule.backToList')}
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
      onClick: () => router.push(`${LIST_PATH}/${schedule.id}/edit`),
    },
    {
      key: 'assign',
      label: t('hr.workSchedule.assign'),
      icon: <UserPlus size={14} />,
      onClick: () => setAssignOpen(true),
    },
    {
      key: 'default',
      label: t('hr.workSchedule.setDefault'),
      icon: <Star size={14} />,
      disabled: schedule.isDefault,
      onClick: () => void handleSetDefault(),
    },
    {
      key: 'deactivate',
      label: schedule.isDefault
        ? t('hr.workSchedule.defaultCannotDeactivate')
        : t('hr.workSchedule.deactivate'),
      danger: true,
      disabled: schedule.isDefault || !schedule.isActive,
      onClick: () => setConfirmDeactivate(true),
    },
    { type: 'divider' },
    {
      key: 'delete',
      label: schedule.isDefault
        ? t('hr.workSchedule.defaultCannotDelete')
        : t('hr.workSchedule.delete'),
      icon: <Trash2 size={14} />,
      danger: true,
      disabled: schedule.isDefault,
      onClick: () => setConfirmDelete(true),
    },
  ];

  return (
    <div className={`erp-pro-list-page erp-users-page erp-employee-detail-page ${DETAIL_PAGE_V2}`}>
      <AssignWorkScheduleModal
        open={assignOpen}
        schedule={schedule}
        onClose={() => setAssignOpen(false)}
      />
      <ConfirmDialog
        open={confirmDeactivate}
        title={t('hr.workSchedule.deactivateTitle')}
        description={t('hr.workSchedule.deactivateDescription')}
        confirmLabel={t('hr.workSchedule.deactivate')}
        danger
        confirmLoading={deactivateMutation.isPending}
        onConfirm={() => void handleDeactivate()}
        onCancel={() => setConfirmDeactivate(false)}
      />
      <ConfirmDialog
        open={confirmDelete}
        title={t('hr.workSchedule.deleteTitle')}
        description={t('hr.workSchedule.deleteDescription', {
          name: schedule.name,
          count: schedule.assignedEmployeeCount,
        })}
        confirmLabel={t('hr.workSchedule.delete')}
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
                  icon={<UserPlus size={14} />}
                  onClick={() => setAssignOpen(true)}
                >
                  {isCompact ? undefined : t('hr.workSchedule.assign')}
                </Button>
                <Button
                  icon={<Star size={14} />}
                  disabled={schedule.isDefault}
                  loading={defaultMutation.isPending}
                  onClick={() => void handleSetDefault()}
                >
                  {isCompact ? undefined : t('hr.workSchedule.setDefault')}
                </Button>
                <Button
                  type="primary"
                  icon={<Pencil size={14} />}
                  onClick={() =>
                    router.push(`${LIST_PATH}/${schedule.id}/edit`)
                  }
                >
                  {isCompact ? undefined : t('common.update')}
                </Button>
                <Button
                  danger
                  disabled={schedule.isDefault || !schedule.isActive}
                  title={
                    schedule.isDefault
                      ? t('hr.workSchedule.defaultCannotDeactivate')
                      : undefined
                  }
                  onClick={() => setConfirmDeactivate(true)}
                >
                  {isCompact ? undefined : t('hr.workSchedule.deactivate')}
                </Button>
                <Button
                  danger
                  icon={<Trash2 size={14} />}
                  disabled={schedule.isDefault}
                  title={
                    schedule.isDefault
                      ? t('hr.workSchedule.defaultCannotDelete')
                      : undefined
                  }
                  aria-label={t('hr.workSchedule.delete')}
                  onClick={() => setConfirmDelete(true)}
                >
                  {isCompact ? undefined : t('hr.workSchedule.delete')}
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
                  schedule.isActive ? t('common.active') : t('common.inactive')
                }
                variant={schedule.isActive ? 'success' : 'default'}
              />
              {schedule.isDefault ? (
                <Tag color="orange" className="m-0 rounded-xl">
                  {t('hr.workSchedule.defaultBadge')}
                </Tag>
              ) : null}
            </div>
            <h2 className="erp-users-name erp-employee-hero-name m-0 break-words">
              {schedule.name}
            </h2>
            <p className="erp-users-email m-0 mt-1.5 break-words sm:text-left">
              {schedule.description || t('pages.hr.workSchedules.listDescription')}
            </p>
          </div>
        </div>
      </div>

      <div className="erp-users-stat-bar erp-employee-meta-bar erp-contract-meta-bar">
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">
              {t('hr.workSchedule.daysPerWeek')}
            </p>
            <p className="erp-employee-meta-value">
              {schedule.workingDaysPerWeek}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">
              {t('hr.workSchedule.hoursPerWeek')}
            </p>
            <p className="erp-employee-meta-value">{schedule.hoursPerWeek}</p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.workSchedule.employees')}</p>
            <p className="erp-employee-meta-value">
              {schedule.assignedEmployeeCount.toLocaleString()}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.assetLabels.updatedAt')}</p>
            <p className="erp-employee-meta-value">
              {formatProjectDate(schedule.updatedAt)}
            </p>
          </div>
        </div>
      </div>

      {!schedule.isActive ? (
        <ErpNotice
          tone="warning"
          className="mb-0"
          title={t('hr.workSchedule.inactiveNotice')}
        />
      ) : null}

      <div className="erp-pro-card min-w-0 overflow-hidden">
        <div className="erp-employee-tab-panel erp-contract-detail-body">
          <DetailSection title={t('hr.workSchedule.details')}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <MetaItem label={t('hr.workSchedule.name')}>{schedule.name}</MetaItem>
              <MetaItem label={t('common.status')}>
                <StatusBadge
                  label={
                    schedule.isActive
                      ? t('common.active')
                      : t('common.inactive')
                  }
                  variant={schedule.isActive ? 'success' : 'default'}
                />
              </MetaItem>
              <MetaItem label={t('hr.workSchedule.defaultBadge')}>
                {schedule.isDefault ? t('common.yes') : t('common.no')}
              </MetaItem>
              <MetaItem label={t('hr.table.createdDate')}>
                {formatProjectDate(schedule.createdAt)}
              </MetaItem>
              {schedule.description ? (
                <div className="md:col-span-2">
                  <MetaItem label={t('hr.workSchedule.description')}>
                    <span className="whitespace-pre-wrap">
                      {schedule.description}
                    </span>
                  </MetaItem>
                </div>
              ) : null}
            </div>
          </DetailSection>

          <DetailSection title={t('hr.workSchedule.weekPattern')}>
            <WorkScheduleWeekGrid days={schedule.days} />
          </DetailSection>
        </div>
      </div>
    </div>
  );
}
