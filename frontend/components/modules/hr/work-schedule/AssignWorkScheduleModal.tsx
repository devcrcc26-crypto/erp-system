'use client';

import { useState } from 'react';
import { Button, DatePicker, Form, Input, Modal, Select } from 'antd';
import type { Dayjs } from 'dayjs';
import { UserPlus } from 'lucide-react';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import UserSelect from '@/components/ui/UserSelect/UserSelect';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { WorkSchedule } from '@/lib/api/work-schedule.types';
import {
  useAssignWorkSchedule,
  useEmployeeWorkSchedule,
  useWorkScheduleList,
} from '@/lib/query/work-schedule';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface AssignFormValues {
  employeeId?: string;
  scheduleId?: string;
  effectiveFrom: Dayjs;
  notes?: string;
}

/**
 * Assigns a work schedule to an employee - import-modal chrome + labeled form.
 * After confirm, asks whether to recalculate attendance from the effective date.
 */
export default function AssignWorkScheduleModal({
  open,
  onClose,
  schedule,
  employeeId,
}: {
  open: boolean;
  onClose: () => void;
  schedule?: WorkSchedule | null;
  employeeId?: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<AssignFormValues>();
  const pickEmployee = Boolean(schedule);
  const watchedEmployeeId = Form.useWatch('employeeId', form);
  const resolvedEmployeeId = pickEmployee ? watchedEmployeeId : employeeId;

  const currentQuery = useEmployeeWorkSchedule(
    resolvedEmployeeId ?? '',
    open && Boolean(resolvedEmployeeId),
  );
  const schedulesQuery = useWorkScheduleList(open && !pickEmployee);
  const assignMutation = useAssignWorkSchedule();

  const [pendingValues, setPendingValues] = useState<AssignFormValues | null>(
    null,
  );
  const [recalcConfirmOpen, setRecalcConfirmOpen] = useState(false);

  function resetAndClose(): void {
    form.resetFields();
    setPendingValues(null);
    setRecalcConfirmOpen(false);
    onClose();
  }

  function handleFormFinish(values: AssignFormValues): void {
    const nextEmployeeId = pickEmployee ? values.employeeId : employeeId;
    const nextScheduleId = pickEmployee ? schedule?.id : values.scheduleId;
    if (!nextEmployeeId || !nextScheduleId) {
      return;
    }
    setPendingValues(values);
    setRecalcConfirmOpen(true);
  }

  async function submitAssign(recalculateAttendance: boolean): Promise<void> {
    if (!pendingValues) {
      return;
    }
    const nextEmployeeId = pickEmployee
      ? pendingValues.employeeId
      : employeeId;
    const nextScheduleId = pickEmployee
      ? schedule?.id
      : pendingValues.scheduleId;
    if (!nextEmployeeId || !nextScheduleId) {
      return;
    }

    try {
      const result = await assignMutation.mutateAsync({
        scheduleId: nextScheduleId,
        employeeId: nextEmployeeId,
        effectiveFrom: pendingValues.effectiveFrom.format('YYYY-MM-DD'),
        notes: pendingValues.notes?.trim() || undefined,
        recalculateAttendance,
      });
      messageApi.success(t('hr.workSchedule.assigned'));
      if (recalculateAttendance && result.attendanceRecalc) {
        const { updatedRecords, updatedDays, skippedLockedMonths } =
          result.attendanceRecalc;
        messageApi.info(
          t('hr.workSchedule.attendanceRecalcResult', {
            records: updatedRecords,
            days: updatedDays,
            skipped: skippedLockedMonths,
          }),
        );
      }
      resetAndClose();
    } catch (error: unknown) {
      notifyApiError(error, t('hr.workSchedule.assignFailed'), messageApi);
    }
  }

  const currentName = currentQuery.data?.current.name;
  const effectiveLabel = pendingValues?.effectiveFrom
    ? pendingValues.effectiveFrom.format('YYYY-MM-DD')
    : '';

  return (
    <>
      <Modal
        open={open}
        title={null}
        onCancel={resetAndClose}
        footer={[
          <Button
            key="cancel"
            className="erp-user-import-btn"
            onClick={resetAndClose}
            disabled={assignMutation.isPending}
          >
            {t('common.cancel')}
          </Button>,
          <Button
            key="assign"
            type="primary"
            className="erp-user-import-btn"
            loading={assignMutation.isPending}
            onClick={() => form.submit()}
          >
            {t('hr.workSchedule.assign')}
          </Button>,
        ]}
        width={480}
        centered
        rootClassName="erp-user-import-modal"
        className="erp-user-import-modal"
        classNames={{
          content: 'erp-user-import-modal-content',
          footer: 'erp-user-import-modal-footer',
          body: 'erp-user-import-modal-body',
        }}
        styles={{
          content: {
            borderRadius: 14,
            overflow: 'hidden',
            padding: 0,
          },
        }}
        destroyOnHidden
        mask={{ closable: !assignMutation.isPending }}
        closable={!assignMutation.isPending}
        afterOpenChange={(visible) => {
          if (visible) {
            form.setFieldsValue({
              effectiveFrom: undefined,
              employeeId: employeeId,
              scheduleId: schedule?.id,
              notes: undefined,
            });
          }
        }}
      >
        <div className="erp-user-import">
          <div className="erp-user-import-header">
            <div className="erp-user-import-header-icon" aria-hidden>
              <UserPlus size={22} strokeWidth={1.75} />
            </div>
            <div className="erp-user-import-header-copy">
              <h3 className="erp-user-import-title">
                {t('hr.workSchedule.assign')}
              </h3>
              <p className="erp-user-import-desc">
                {schedule?.name ?? t('hr.workSchedule.assignDescription')}
              </p>
            </div>
          </div>

          <div className="erp-user-import-panel">
            <Form<AssignFormValues>
              form={form}
              layout="vertical"
              requiredMark={false}
              onFinish={handleFormFinish}
              disabled={assignMutation.isPending}
            >
              {pickEmployee ? (
                <Form.Item
                  name="employeeId"
                  label={t('hr.workSchedule.employee')}
                  rules={[
                    {
                      required: true,
                      message: t('hr.workSchedule.employeeRequired'),
                    },
                  ]}
                >
                  <UserSelect
                    allowClear={false}
                    placeholder={t('hr.workSchedule.searchEmployee')}
                    className="w-full"
                  />
                </Form.Item>
              ) : (
                <Form.Item
                  name="scheduleId"
                  label={t('hr.workSchedule.name')}
                  rules={[
                    {
                      required: true,
                      message: t('hr.workSchedule.selectSchedule'),
                    },
                  ]}
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder={t('hr.workSchedule.selectSchedule')}
                    className="w-full"
                    options={(schedulesQuery.data ?? [])
                      .filter((row) => row.isActive)
                      .map((row) => ({ value: row.id, label: row.name }))}
                  />
                </Form.Item>
              )}

              <Form.Item
                name="effectiveFrom"
                label={t('hr.workSchedule.effectiveFrom')}
                rules={[
                  {
                    required: true,
                    message: t('hr.workSchedule.effectiveFromRequired'),
                  },
                ]}
              >
                <DatePicker className="w-full" />
              </Form.Item>

              <Form.Item name="notes" label={t('hr.workSchedule.notes')}>
                <Input.TextArea
                  rows={3}
                  maxLength={2000}
                  showCount
                  placeholder={t('hr.workSchedule.notes')}
                />
              </Form.Item>

              {currentName ? (
                <ErpNotice
                  tone="info"
                  title={t('hr.workSchedule.currentSchedule')}
                  description={`${currentName}. ${t('hr.workSchedule.assignClosesPrevious')}`}
                />
              ) : null}
            </Form>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={recalcConfirmOpen}
        title={t('hr.workSchedule.recalcAttendanceTitle')}
        description={t('hr.workSchedule.recalcAttendanceDescription', {
          date: effectiveLabel,
        })}
        confirmLabel={t('hr.workSchedule.recalcAttendanceYes')}
        cancelLabel={t('hr.workSchedule.recalcAttendanceNo')}
        confirmLoading={assignMutation.isPending}
        onConfirm={() => void submitAssign(true)}
        onCancel={() => void submitAssign(false)}
      />
    </>
  );
}
