'use client';

import { useState } from 'react';
import { Button, DatePicker, Modal, Select, Table } from 'antd';
import { UserAddOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { ScheduleAssignmentHistoryItem } from '@/lib/api/work-schedule.types';
import {
  useAssignWorkSchedule,
  useEmployeeWorkSchedule,
  useWorkScheduleList,
} from '@/lib/query/work-schedule';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';

const DAY_KEYS = [
  'hr.workSchedule.day0',
  'hr.workSchedule.day1',
  'hr.workSchedule.day2',
  'hr.workSchedule.day3',
  'hr.workSchedule.day4',
  'hr.workSchedule.day5',
  'hr.workSchedule.day6',
] as const;

/**
 * Employee profile tab: current work schedule and assignment history.
 */
export default function EmployeeWorkScheduleSection({
  employeeId,
}: {
  employeeId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const canViewHr = useCanViewHr();
  const [assignOpen, setAssignOpen] = useState(false);
  const [scheduleId, setScheduleId] = useState<string | undefined>();
  const [effectiveFrom, setEffectiveFrom] = useState<Dayjs | null>(dayjs());

  const detailQuery = useEmployeeWorkSchedule(employeeId, true);
  const schedulesQuery = useWorkScheduleList(canViewHr && assignOpen);
  const assignMutation = useAssignWorkSchedule(scheduleId ?? '');

  const current = detailQuery.data?.current;
  const history = detailQuery.data?.history ?? [];

  async function handleAssign(): Promise<void> {
    if (!scheduleId || !effectiveFrom) {
      return;
    }
    try {
      await assignMutation.mutateAsync({
        employeeId,
        effectiveFrom: effectiveFrom.format('YYYY-MM-DD'),
      });
      messageApi.success(t('hr.workSchedule.assigned'));
      setAssignOpen(false);
    } catch (error: unknown) {
      notifyApiError(error, t('hr.workSchedule.assignFailed'), messageApi);
    }
  }

  const historyColumns: ColumnsType<ScheduleAssignmentHistoryItem> = [
    {
      title: t('hr.workSchedule.name'),
      dataIndex: 'scheduleName',
      key: 'scheduleName',
    },
    {
      title: t('hr.workSchedule.effectiveFrom'),
      dataIndex: 'effectiveFrom',
      key: 'effectiveFrom',
      render: (value: string) => formatProjectDate(value),
    },
    {
      title: t('hr.workSchedule.effectiveTo'),
      dataIndex: 'effectiveTo',
      key: 'effectiveTo',
      render: (value: string | null) =>
        value ? formatProjectDate(value) : t('hr.workSchedule.ongoing'),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="erp-employee-section">
        <div className="erp-employee-section-header">
          <h3 className="erp-employee-section-title">
            {t('hr.workSchedule.currentSchedule')}
          </h3>
          {canViewHr ? (
            <Button
              icon={<UserAddOutlined />}
              onClick={() => setAssignOpen(true)}
            >
              {t('hr.workSchedule.assign')}
            </Button>
          ) : null}
        </div>
        <div className="erp-employee-section-body">
          {current ? (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="erp-users-cell-strong">{current.name}</span>
                {current.isDefault ? (
                  <StatusBadge
                    label={t('hr.workSchedule.defaultBadge')}
                    variant="orange"
                  />
                ) : null}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {current.days.map((day) => (
                  <div
                    key={day.dayOfWeek}
                    className="rounded-lg border border-[#e8ebef] px-3 py-2"
                  >
                    <p className="m-0 text-sm font-medium">
                      {t(DAY_KEYS[day.dayOfWeek])}
                    </p>
                    <p className="erp-users-cell-sub m-0">
                      {!day.isWorkingDay
                        ? t('hr.workSchedule.offDay')
                        : day.isHalfDay
                          ? `${day.morningStart}–${day.morningEnd} (${day.totalHours}h)`
                          : `${day.morningStart}–${day.morningEnd}, ${day.afternoonStart}–${day.afternoonEnd} (${day.totalHours}h)`}
                    </p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="erp-users-cell-sub m-0">
              {t('hr.workSchedule.noSchedule')}
            </p>
          )}
        </div>
      </div>

      <div className="erp-employee-section">
        <div className="erp-employee-section-header">
          <h3 className="erp-employee-section-title">
            {t('hr.workSchedule.history')}
          </h3>
        </div>
        <div className="erp-employee-section-body">
          <Table<ScheduleAssignmentHistoryItem>
            rowKey="id"
            size="small"
            pagination={false}
            columns={historyColumns}
            dataSource={history}
            locale={{
              emptyText: t('hr.workSchedule.noHistory'),
            }}
          />
        </div>
      </div>

      <Modal
        title={t('hr.workSchedule.assign')}
        open={assignOpen}
        onCancel={() => setAssignOpen(false)}
        onOk={() => void handleAssign()}
        confirmLoading={assignMutation.isPending}
        okButtonProps={{ disabled: !scheduleId || !effectiveFrom }}
      >
        {current ? (
          <p className="mb-3 text-sm">
            {t('hr.workSchedule.currentSchedule')}: <strong>{current.name}</strong>
          </p>
        ) : null}
        <Select
          className="mb-3 w-full"
          placeholder={t('hr.workSchedule.selectSchedule')}
          value={scheduleId}
          onChange={(value: string) => setScheduleId(value)}
          options={(schedulesQuery.data ?? [])
            .filter((row) => row.isActive)
            .map((row) => ({ value: row.id, label: row.name }))}
        />
        <DatePicker
          className="w-full"
          value={effectiveFrom}
          onChange={(value) => setEffectiveFrom(value)}
        />
      </Modal>
    </div>
  );
}
