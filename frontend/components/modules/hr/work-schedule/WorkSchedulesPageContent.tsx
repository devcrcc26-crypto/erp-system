'use client';

import { useMemo, useState } from 'react';
import {
  Button,
  Card,
  DatePicker,
  Drawer,
  Form,
  Input,
  Modal,
  Select,
  Switch,
  TimePicker,
  Dropdown,
  Grid,
  Tag,
} from 'antd';
import {
  CalendarOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  StarOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  CreateWorkSchedulePayload,
  WorkSchedule,
  WorkScheduleDayInput,
} from '@/lib/api/work-schedule.types';
import { USER_DIRECTORY_PAGE_LIMIT, useUsersDirectory } from '@/lib/query/users';
import {
  useAssignWorkSchedule,
  useCreateWorkSchedule,
  useDeactivateWorkSchedule,
  useEmployeeWorkSchedule,
  useSetDefaultWorkSchedule,
  useUpdateWorkSchedule,
  useWorkScheduleList,
} from '@/lib/query/work-schedule';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatUserName } from '@/lib/utils/user-display';
import { formatProjectDate } from '@/lib/utils/project-display';

const DEFAULT_MORNING_START = '08:30';
const DEFAULT_MORNING_END = '12:30';
const DEFAULT_AFTERNOON_START = '13:30';
const DEFAULT_AFTERNOON_END = '17:30';

type DayMode = 'off' | 'half' | 'working';

interface DayFormValue {
  mode: DayMode;
  morningStart?: Dayjs | null;
  morningEnd?: Dayjs | null;
  afternoonStart?: Dayjs | null;
  afternoonEnd?: Dayjs | null;
}

interface ScheduleFormValues {
  name: string;
  description?: string;
  isDefault: boolean;
  isActive: boolean;
  days: DayFormValue[];
}

function parseTime(value: string | null | undefined): Dayjs | null {
  if (!value) {
    return null;
  }
  return dayjs(value, 'HH:mm');
}

function formatTime(value: Dayjs | null | undefined): string | null {
  if (!value) {
    return null;
  }
  return value.format('HH:mm');
}

function hoursBetween(start: string, end: string): number {
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  const diff = endH * 60 + endM - (startH * 60 + startM);
  if (diff <= 0) {
    return 0;
  }
  return Math.round((diff / 60) * 10) / 10;
}

function computeHours(day: DayFormValue): number {
  if (day.mode === 'off') {
    return 0;
  }
  const morningStart = formatTime(day.morningStart);
  const morningEnd = formatTime(day.morningEnd);
  if (!morningStart || !morningEnd) {
    return 0;
  }
  let hours = hoursBetween(morningStart, morningEnd);
  if (day.mode === 'working') {
    const afternoonStart = formatTime(day.afternoonStart);
    const afternoonEnd = formatTime(day.afternoonEnd);
    if (afternoonStart && afternoonEnd) {
      hours += hoursBetween(afternoonStart, afternoonEnd);
    }
  }
  return Math.round(hours * 10) / 10;
}

function defaultDays(): DayFormValue[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    if (dayOfWeek === 0) {
      return { mode: 'off' as const };
    }
    if (dayOfWeek === 6) {
      return {
        mode: 'half' as const,
        morningStart: parseTime(DEFAULT_MORNING_START),
        morningEnd: parseTime(DEFAULT_MORNING_END),
      };
    }
    return {
      mode: 'working' as const,
      morningStart: parseTime(DEFAULT_MORNING_START),
      morningEnd: parseTime(DEFAULT_MORNING_END),
      afternoonStart: parseTime(DEFAULT_AFTERNOON_START),
      afternoonEnd: parseTime(DEFAULT_AFTERNOON_END),
    };
  });
}

function daysFromSchedule(schedule: WorkSchedule): DayFormValue[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    const row = schedule.days.find((item) => item.dayOfWeek === dayOfWeek);
    if (!row || !row.isWorkingDay) {
      return { mode: 'off' as const };
    }
    if (row.isHalfDay) {
      return {
        mode: 'half' as const,
        morningStart: parseTime(row.morningStart),
        morningEnd: parseTime(row.morningEnd),
      };
    }
    return {
      mode: 'working' as const,
      morningStart: parseTime(row.morningStart),
      morningEnd: parseTime(row.morningEnd),
      afternoonStart: parseTime(row.afternoonStart),
      afternoonEnd: parseTime(row.afternoonEnd),
    };
  });
}

function toDayPayload(days: DayFormValue[]): WorkScheduleDayInput[] {
  return days.map((day, dayOfWeek) => {
    const isWorkingDay = day.mode !== 'off';
    const isHalfDay = day.mode === 'half';
    return {
      dayOfWeek,
      isWorkingDay,
      isHalfDay,
      morningStart: isWorkingDay ? formatTime(day.morningStart) : null,
      morningEnd: isWorkingDay ? formatTime(day.morningEnd) : null,
      afternoonStart: day.mode === 'working' ? formatTime(day.afternoonStart) : null,
      afternoonEnd: day.mode === 'working' ? formatTime(day.afternoonEnd) : null,
    };
  });
}

/**
 * Work schedule list, editor, default, and employee assignment.
 */
export default function WorkSchedulesPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isNarrow = screens.sm === false;
  const canViewHr = useCanViewHr();
  const [form] = Form.useForm<ScheduleFormValues>();
  const watchedDays = Form.useWatch('days', form) as DayFormValue[] | undefined;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<WorkSchedule | null>(null);
  const [assignSchedule, setAssignSchedule] = useState<WorkSchedule | null>(
    null,
  );
  const [assignEmployeeId, setAssignEmployeeId] = useState<string | undefined>();
  const [effectiveFrom, setEffectiveFrom] = useState<Dayjs | null>(dayjs());
  const [assignNotes, setAssignNotes] = useState('');

  const listQuery = useWorkScheduleList(canViewHr);
  const usersQuery = useUsersDirectory(
    { page: 1, limit: USER_DIRECTORY_PAGE_LIMIT },
    { enabled: Boolean(assignSchedule) },
  );
  const currentQuery = useEmployeeWorkSchedule(
    assignEmployeeId ?? '',
    Boolean(assignSchedule && assignEmployeeId),
  );
  const createMutation = useCreateWorkSchedule();
  const updateMutation = useUpdateWorkSchedule(editing?.id ?? '');
  const deactivateMutation = useDeactivateWorkSchedule();
  const defaultMutation = useSetDefaultWorkSchedule();
  const assignMutation = useAssignWorkSchedule(assignSchedule?.id ?? '');

  const schedules = listQuery.data ?? [];

  const dayLabels = useMemo(
    () => [
      t('hr.workSchedule.day0'),
      t('hr.workSchedule.day1'),
      t('hr.workSchedule.day2'),
      t('hr.workSchedule.day3'),
      t('hr.workSchedule.day4'),
      t('hr.workSchedule.day5'),
      t('hr.workSchedule.day6'),
    ],
    [t],
  );

  function openCreate(): void {
    setEditing(null);
    form.setFieldsValue({
      name: '',
      description: undefined,
      isDefault: false,
      isActive: true,
      days: defaultDays(),
    });
    setDrawerOpen(true);
  }

  function openEdit(schedule: WorkSchedule): void {
    setEditing(schedule);
    form.setFieldsValue({
      name: schedule.name,
      description: schedule.description ?? undefined,
      isDefault: schedule.isDefault,
      isActive: schedule.isActive,
      days: daysFromSchedule(schedule),
    });
    setDrawerOpen(true);
  }

  async function handleSave(): Promise<void> {
    const values = await form.validateFields();
    const payload: CreateWorkSchedulePayload = {
      name: values.name.trim(),
      description: values.description?.trim() || undefined,
      isDefault: values.isDefault,
      isActive: values.isActive,
      days: toDayPayload(values.days),
    };
    try {
      if (editing) {
        await updateMutation.mutateAsync(payload);
        messageApi.success(t('hr.workSchedule.updated'));
      } else {
        await createMutation.mutateAsync(payload);
        messageApi.success(t('hr.workSchedule.created'));
      }
      setDrawerOpen(false);
    } catch (error: unknown) {
      notifyApiError(error, t('hr.workSchedule.saveFailed'), messageApi);
    }
  }

  async function handleAssign(): Promise<void> {
    if (!assignSchedule || !assignEmployeeId || !effectiveFrom) {
      return;
    }
    try {
      await assignMutation.mutateAsync({
        employeeId: assignEmployeeId,
        effectiveFrom: effectiveFrom.format('YYYY-MM-DD'),
        notes: assignNotes.trim() || undefined,
      });
      messageApi.success(t('hr.workSchedule.assigned'));
      setAssignSchedule(null);
      setAssignEmployeeId(undefined);
      setAssignNotes('');
    } catch (error: unknown) {
      notifyApiError(error, t('hr.workSchedule.assignFailed'), messageApi);
    }
  }

  if (!canViewHr) {
    return (
      <div className="erp-pro-list-page erp-users-page">
        <ErpNotice tone="warning" title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page erp-users-page">
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
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
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
          </div>
        ) : (
          <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {schedules.map((schedule) => (
              <Card
                key={schedule.id}
                className={schedule.isActive ? '' : 'opacity-60'}
                title={
                  <div className="flex items-center gap-2">
                    <span className="truncate">{schedule.name}</span>
                    {schedule.isDefault ? (
                      <Tag color="orange">{t('hr.workSchedule.defaultBadge')}</Tag>
                    ) : null}
                  </div>
                }
                extra={
                  <Dropdown
                    trigger={['click']}
                    menu={{
                      items: [
                        {
                          key: 'edit',
                          label: t('common.update'),
                          onClick: () => openEdit(schedule),
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

      <Drawer
        title={
          editing ? t('hr.workSchedule.edit') : t('hr.workSchedule.new')
        }
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={isNarrow ? '100%' : 640}
        destroyOnClose
        extra={
          <Button
            type="primary"
            onClick={() => void handleSave()}
            loading={createMutation.isPending || updateMutation.isPending}
          >
            {t('common.save')}
          </Button>
        }
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item
            name="name"
            label={t('hr.workSchedule.name')}
            rules={[{ required: true, message: t('hr.workSchedule.nameRequired') }]}
          >
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="description" label={t('hr.workSchedule.description')}>
            <Input.TextArea rows={2} maxLength={2000} />
          </Form.Item>
          <div className="erp-form-grid-2">
            <Form.Item
              name="isDefault"
              label={t('hr.workSchedule.defaultBadge')}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
            <Form.Item
              name="isActive"
              label={t('common.active')}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </div>

          {dayLabels.map((label, index) => {
            const day = watchedDays?.[index];
            const mode = day?.mode ?? 'off';
            const hours = day ? computeHours(day) : 0;
            return (
              <div
                key={label}
                className="mb-4 rounded-xl border border-[#e8ebef] p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-medium">{label}</span>
                  <span className="erp-users-cell-sub">
                    {hours} {t('hr.workSchedule.hours')}
                  </span>
                </div>
                <Form.Item name={['days', index, 'mode']} className="mb-2">
                  <Select
                    options={[
                      { value: 'working', label: t('hr.workSchedule.workingDay') },
                      { value: 'half', label: t('hr.workSchedule.halfDay') },
                      { value: 'off', label: t('hr.workSchedule.offDay') },
                    ]}
                  />
                </Form.Item>
                {mode !== 'off' ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Form.Item
                      name={['days', index, 'morningStart']}
                      label={t('hr.workSchedule.morningStart')}
                      rules={[{ required: true }]}
                    >
                      <TimePicker format="HH:mm" className="w-full" />
                    </Form.Item>
                    <Form.Item
                      name={['days', index, 'morningEnd']}
                      label={t('hr.workSchedule.morningEnd')}
                      rules={[{ required: true }]}
                    >
                      <TimePicker format="HH:mm" className="w-full" />
                    </Form.Item>
                    {mode === 'working' ? (
                      <>
                        <Form.Item
                          name={['days', index, 'afternoonStart']}
                          label={t('hr.workSchedule.afternoonStart')}
                          rules={[{ required: true }]}
                        >
                          <TimePicker format="HH:mm" className="w-full" />
                        </Form.Item>
                        <Form.Item
                          name={['days', index, 'afternoonEnd']}
                          label={t('hr.workSchedule.afternoonEnd')}
                          rules={[{ required: true }]}
                        >
                          <TimePicker format="HH:mm" className="w-full" />
                        </Form.Item>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </Form>
      </Drawer>

      <Modal
        title={t('hr.workSchedule.assign')}
        open={Boolean(assignSchedule)}
        onCancel={() => {
          setAssignSchedule(null);
          setAssignEmployeeId(undefined);
        }}
        onOk={() => void handleAssign()}
        confirmLoading={assignMutation.isPending}
        okButtonProps={{ disabled: !assignEmployeeId || !effectiveFrom }}
      >
        <p className="erp-users-cell-sub mb-3">
          {assignSchedule?.name}
        </p>
        <Select
          showSearch
          className="mb-3 w-full"
          placeholder={t('hr.workSchedule.searchEmployee')}
          value={assignEmployeeId}
          onChange={(value: string) => setAssignEmployeeId(value)}
          optionFilterProp="label"
          options={(usersQuery.data?.data ?? []).map((user) => ({
            value: user.id,
            label: formatUserName(user),
          }))}
        />
        {currentQuery.data ? (
          <p className="mb-3 text-sm">
            {t('hr.workSchedule.currentSchedule')}:{' '}
            <strong>{currentQuery.data.current.name}</strong>
          </p>
        ) : null}
        <DatePicker
          className="mb-3 w-full"
          value={effectiveFrom}
          onChange={(value) => setEffectiveFrom(value)}
        />
        <Input.TextArea
          rows={2}
          value={assignNotes}
          onChange={(event) => setAssignNotes(event.target.value)}
          placeholder={t('hr.workSchedule.notes')}
        />
        {currentQuery.data?.current ? (
          <p className="erp-users-cell-sub mt-2 mb-0">
            {t('hr.workSchedule.assignClosesPrevious')}
          </p>
        ) : null}
        {effectiveFrom ? (
          <p className="erp-users-cell-sub mt-1 mb-0">
            {t('hr.labels.startDate')}: {formatProjectDate(effectiveFrom.toISOString())}
          </p>
        ) : null}
      </Modal>
    </div>
  );
}
