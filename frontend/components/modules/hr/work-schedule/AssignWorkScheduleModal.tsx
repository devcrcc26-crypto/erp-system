'use client';

import { useState } from 'react';
import { DatePicker, Input, Modal, Select } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { WorkSchedule } from '@/lib/api/work-schedule.types';
import { USER_DIRECTORY_PAGE_LIMIT, useUsersDirectory } from '@/lib/query/users';
import {
  useAssignWorkSchedule,
  useEmployeeWorkSchedule,
} from '@/lib/query/work-schedule';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';

/**
 * Assigns a work schedule to an employee from a given effective date.
 */
export default function AssignWorkScheduleModal({
  schedule,
  onClose,
}: {
  schedule: WorkSchedule | null;
  onClose: () => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const [effectiveFrom, setEffectiveFrom] = useState<Dayjs | null>(dayjs());
  const [notes, setNotes] = useState('');

  const usersQuery = useUsersDirectory(
    { page: 1, limit: USER_DIRECTORY_PAGE_LIMIT },
    { enabled: Boolean(schedule) },
  );
  const currentQuery = useEmployeeWorkSchedule(
    employeeId ?? '',
    Boolean(schedule && employeeId),
  );
  const assignMutation = useAssignWorkSchedule(schedule?.id ?? '');

  function resetAndClose(): void {
    setEmployeeId(undefined);
    setNotes('');
    setEffectiveFrom(dayjs());
    onClose();
  }

  async function handleAssign(): Promise<void> {
    if (!schedule || !employeeId || !effectiveFrom) {
      return;
    }
    try {
      await assignMutation.mutateAsync({
        employeeId,
        effectiveFrom: effectiveFrom.format('YYYY-MM-DD'),
        notes: notes.trim() || undefined,
      });
      messageApi.success(t('hr.workSchedule.assigned'));
      resetAndClose();
    } catch (error: unknown) {
      notifyApiError(error, t('hr.workSchedule.assignFailed'), messageApi);
    }
  }

  return (
    <Modal
      title={t('hr.workSchedule.assign')}
      open={Boolean(schedule)}
      onCancel={resetAndClose}
      onOk={() => void handleAssign()}
      confirmLoading={assignMutation.isPending}
      okButtonProps={{ disabled: !employeeId || !effectiveFrom }}
      destroyOnHidden
    >
      <p className="erp-users-cell-sub mb-3">{schedule?.name}</p>
      <Select
        showSearch
        className="mb-3 w-full"
        placeholder={t('hr.workSchedule.searchEmployee')}
        value={employeeId}
        onChange={(value: string) => setEmployeeId(value)}
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
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder={t('hr.workSchedule.notes')}
      />
      {currentQuery.data?.current ? (
        <p className="erp-users-cell-sub mt-2 mb-0">
          {t('hr.workSchedule.assignClosesPrevious')}
        </p>
      ) : null}
      {effectiveFrom ? (
        <p className="erp-users-cell-sub mt-1 mb-0">
          {t('hr.labels.startDate')}:{' '}
          {formatProjectDate(effectiveFrom.toISOString())}
        </p>
      ) : null}
    </Modal>
  );
}
