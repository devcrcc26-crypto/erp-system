'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, DatePicker, Form, Modal, Space, Spin, Tooltip } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type { EmploymentState } from '@/lib/api/employment';
import {
  useCancelSeparation,
  useSeparationPreview,
  useUpdateLeavingDate,
} from '@/lib/query/employment';

type EditFormValues = {
  leavingDate: Dayjs;
  confirmLockedPayroll?: boolean;
};

/** Shows a scheduled or effective separation, with edit leaving date / cancel for HR. */
export default function EmployeeSeparationBanner({
  userId,
  employment,
  canManage,
}: {
  userId: string;
  employment: EmploymentState;
  canManage: boolean;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const cancel = useCancelSeparation(userId);
  const updateLeaving = useUpdateLeavingDate(userId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form] = Form.useForm<EditFormValues>();
  const watchedLeaving = Form.useWatch('leavingDate', form);
  const leavingDateKey =
    watchedLeaving && dayjs.isDayjs(watchedLeaving)
      ? watchedLeaving.format('YYYY-MM-DD')
      : null;
  const previewQuery = useSeparationPreview(userId, editOpen ? leavingDateKey : null);
  const separation = employment.separation;

  useEffect(() => {
    if (!editOpen || !separation) {
      return;
    }
    form.setFieldsValue({
      leavingDate: dayjs(separation.leavingDate),
      confirmLockedPayroll: false,
    });
  }, [editOpen, form, separation]);

  if (!separation) {
    return null;
  }

  const typeLabel = separation.separationType
    ? t(`users.separation.types.${separation.separationType}`)
    : '';

  const actions = canManage ? (
    <Space size="small" wrap>
      <Button size="small" onClick={() => setEditOpen(true)}>
        {t('users.separation.editLeavingDate')}
      </Button>
      <Tooltip title={separation.canCancel ? undefined : separation.cancelBlockedReason}>
        <Button
          size="small"
          disabled={!separation.canCancel}
          onClick={() => setConfirmOpen(true)}
        >
          {t('users.separation.cancel')}
        </Button>
      </Tooltip>
    </Space>
  ) : null;

  async function handleSaveLeavingDate(): Promise<void> {
    const values = await form.validateFields();
    const nextDate = values.leavingDate.format('YYYY-MM-DD');
    if (nextDate === separation.leavingDate) {
      setEditOpen(false);
      return;
    }
    try {
      await updateLeaving.mutateAsync({
        leavingDate: nextDate,
        confirmLockedPayroll: values.confirmLockedPayroll || undefined,
      });
      messageApi.success(t('users.separation.leavingDateUpdated'));
      setEditOpen(false);
    } catch (error) {
      if (
        error instanceof ApiRequestError &&
        (error.code === 'LOCKED_PAYROLL_CONFIRMATION_REQUIRED' ||
          error.message.includes('already approved or paid'))
      ) {
        form.setFieldsValue({ confirmLockedPayroll: false });
        messageApi.warning(t('users.separation.lockedPayrollConfirmNeeded'));
        return;
      }
      messageApi.error(
        error instanceof ApiRequestError
          ? error.message
          : t('users.separation.saveError'),
      );
    }
  }

  const lockedRuns = previewQuery.data?.lockedPayrollRuns ?? [];
  const needsLockedConfirm = lockedRuns.length > 0;

  return (
    <>
      <Alert
        type={separation.effective ? 'error' : 'warning'}
        showIcon
        className="mx-4 mb-4 sm:mx-6"
        title={
          separation.effective
            ? t('users.separation.bannerSeparated', {
                date: separation.leavingDate,
                type: typeLabel,
              })
            : t('users.separation.bannerScheduled', {
                date: separation.leavingDate,
                type: typeLabel,
              })
        }
        description={separation.reason ?? undefined}
        action={actions}
      />
      <ConfirmDialog
        className="erp-hr-travel-modal"
        open={confirmOpen}
        title={t('users.separation.cancelTitle')}
        description={t('users.separation.cancelDescription')}
        confirmLabel={t('users.separation.cancel')}
        confirmLoading={cancel.isPending}
        onConfirm={() => {
          void (async () => {
            try {
              await cancel.mutateAsync();
              messageApi.success(t('users.separation.cancelled'));
              setConfirmOpen(false);
            } catch (error) {
              messageApi.error(
                error instanceof ApiRequestError
                  ? error.message
                  : t('users.separation.saveError'),
              );
            }
          })();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
      <Modal
        className="erp-hr-travel-modal"
        open={editOpen}
        title={t('users.separation.editLeavingDateTitle')}
        okText={t('users.separation.saveLeavingDate')}
        confirmLoading={updateLeaving.isPending}
        onOk={() => void handleSaveLeavingDate()}
        onCancel={() => setEditOpen(false)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item
            name="leavingDate"
            label={t('users.separation.leavingDate')}
            extra={t('users.separation.leavingDateHint')}
            rules={[
              { required: true, message: t('users.separation.leavingDateRequired') },
            ]}
          >
            <DatePicker className="w-full" />
          </Form.Item>
          {leavingDateKey && previewQuery.isLoading ? <Spin size="small" /> : null}
          {previewQuery.data ? (
            <Alert
              className="mb-3"
              type={previewQuery.data.effectiveImmediately ? 'warning' : 'info'}
              showIcon
              title={
                previewQuery.data.effectiveImmediately
                  ? t('users.separation.effectiveNow')
                  : t('users.separation.effectiveLater', {
                      date: previewQuery.data.leavingDate,
                    })
              }
            />
          ) : null}
          {needsLockedConfirm ? (
            <>
              <Alert
                className="mb-3"
                type="error"
                showIcon
                title={t('users.separation.lockedPayroll', {
                  runs: lockedRuns.map((r) => r.runNumber).join(', '),
                })}
              />
              <Form.Item
                name="confirmLockedPayroll"
                valuePropName="checked"
                rules={[
                  {
                    validator: async (_, value) => {
                      if (!value) {
                        throw new Error(t('users.separation.lockedPayrollConfirm'));
                      }
                    },
                  },
                ]}
              >
                <Checkbox>{t('users.separation.lockedPayrollConfirm')}</Checkbox>
              </Form.Item>
            </>
          ) : null}
        </Form>
      </Modal>
    </>
  );
}
