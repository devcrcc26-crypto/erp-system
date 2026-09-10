'use client';

import { useState } from 'react';
import { Button, Card, Dropdown, Tag } from 'antd';
import {
  CalendarOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  StarOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import AssignWorkScheduleModal from '@/components/modules/hr/work-schedule/AssignWorkScheduleModal';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { WorkSchedule } from '@/lib/api/work-schedule.types';
import {
  useDeactivateWorkSchedule,
  useSetDefaultWorkSchedule,
  useWorkScheduleList,
} from '@/lib/query/work-schedule';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const LIST_PATH = '/hr/work-schedules';

/**
 * Work schedule list — cards link to detail; create is a dedicated page.
 */
export default function WorkSchedulesPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const canViewHr = useCanViewHr();
  const [assignSchedule, setAssignSchedule] = useState<WorkSchedule | null>(
    null,
  );

  const listQuery = useWorkScheduleList(canViewHr);
  const deactivateMutation = useDeactivateWorkSchedule();
  const defaultMutation = useSetDefaultWorkSchedule();
  const schedules = listQuery.data ?? [];

  if (!canViewHr) {
    return (
      <div className="erp-pro-list-page erp-users-page">
        <ErpNotice tone="warning" title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page erp-users-page">
      <AssignWorkScheduleModal
        open={Boolean(assignSchedule)}
        schedule={assignSchedule}
        onClose={() => setAssignSchedule(null)}
      />

      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar">
          <div className="flex min-w-0 items-center gap-2">
            <span className="erp-pro-card-title">
              {t('pages.hr.workSchedules.listTitle')}
            </span>
            <span className="erp-users-count-pill">{schedules.length}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              icon={<ReloadOutlined />}
              onClick={() => void listQuery.refetch()}
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => router.push(`${LIST_PATH}/new`)}
            >
              {t('hr.workSchedule.new')}
            </Button>
          </div>
        </div>

        {schedules.length === 0 && !listQuery.isLoading ? (
          <div className="px-4 py-10 text-center">
            <CalendarOutlined className="mb-2 text-2xl text-[#9ca3af]" />
            <p className="erp-users-cell-strong m-0">
              {t('hr.workSchedule.empty')}
            </p>
            <Button
              type="link"
              className="mt-2"
              onClick={() => router.push(`${LIST_PATH}/new`)}
            >
              {t('hr.workSchedule.new')}
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {schedules.map((schedule) => (
              <Card
                key={schedule.id}
                hoverable
                className={schedule.isActive ? '' : 'opacity-60'}
                onClick={() => router.push(`${LIST_PATH}/${schedule.id}`)}
                title={
                  <div className="flex items-center gap-2">
                    <span className="truncate">{schedule.name}</span>
                    {schedule.isDefault ? (
                      <Tag color="orange">
                        {t('hr.workSchedule.defaultBadge')}
                      </Tag>
                    ) : null}
                  </div>
                }
                extra={
                  <div
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <Dropdown
                      trigger={['click']}
                      menu={{
                        items: [
                          {
                            key: 'edit',
                            label: t('common.update'),
                            onClick: () =>
                              router.push(`${LIST_PATH}/${schedule.id}/edit`),
                          },
                          {
                            key: 'assign',
                            icon: <UserAddOutlined />,
                            label: t('hr.workSchedule.assign'),
                            onClick: () => setAssignSchedule(schedule),
                          },
                          {
                            key: 'default',
                            icon: <StarOutlined />,
                            label: t('hr.workSchedule.setDefault'),
                            disabled: schedule.isDefault,
                            onClick: () =>
                              void defaultMutation
                                .mutateAsync(schedule.id)
                                .then(() =>
                                  messageApi.success(
                                    t('hr.workSchedule.defaultUpdated'),
                                  ),
                                )
                                .catch((error: unknown) =>
                                  notifyApiError(
                                    error,
                                    t('hr.workSchedule.saveFailed'),
                                    messageApi,
                                  ),
                                ),
                          },
                          {
                            key: 'deactivate',
                            danger: true,
                            label: t('hr.workSchedule.deactivate'),
                            disabled: schedule.isDefault || !schedule.isActive,
                            onClick: () =>
                              void deactivateMutation
                                .mutateAsync(schedule.id)
                                .then(() =>
                                  messageApi.success(
                                    t('hr.workSchedule.deactivated'),
                                  ),
                                )
                                .catch((error: unknown) =>
                                  notifyApiError(
                                    error,
                                    t('hr.workSchedule.saveFailed'),
                                    messageApi,
                                  ),
                                ),
                          },
                        ],
                      }}
                    >
                      <Button type="text" icon={<MoreOutlined />} />
                    </Dropdown>
                  </div>
                }
              >
                {schedule.description ? (
                  <p className="erp-users-cell-sub m-0 mb-3 line-clamp-2">
                    {schedule.description}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <StatusBadge
                    label={`${schedule.workingDaysPerWeek} ${t('hr.workSchedule.daysPerWeek')}`}
                    variant="info"
                  />
                  <StatusBadge
                    label={`${schedule.hoursPerWeek} ${t('hr.workSchedule.hoursPerWeek')}`}
                    variant="cyan"
                  />
                  <StatusBadge
                    label={`${schedule.assignedEmployeeCount} ${t('hr.workSchedule.employees')}`}
                    variant="default"
                  />
                  <StatusBadge
                    label={
                      schedule.isActive
                        ? t('common.active')
                        : t('common.inactive')
                    }
                    variant={schedule.isActive ? 'success' : 'default'}
                  />
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
