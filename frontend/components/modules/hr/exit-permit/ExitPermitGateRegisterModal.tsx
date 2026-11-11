'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { useMemo, useState } from 'react';
import { DatePicker, Form, Modal, Select } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { ExitPermitListItem } from '@/lib/api/exit-permit.types';
import { openExitPermitGateRegisterPdf } from '@/lib/query/exit-permit';
import { formatExitPermitDirection } from '@/lib/utils/exit-permit-display';

type ExitPermitGateRegisterDirection = 'ENTRANCE' | 'EXIT' | 'ALL';

interface GateRegisterFormValues {
  permitDate: Dayjs;
  direction: ExitPermitGateRegisterDirection;
}

export default function ExitPermitGateRegisterModal({
  open,
  onClose,
  listRows,
}: {
  open: boolean;
  onClose: () => void;
  listRows: ExitPermitListItem[];
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<GateRegisterFormValues>();
  const [generating, setGenerating] = useState(false);

  const directionOptions = useMemo(
    () => [
      { value: 'ALL' as const, label: t('pages.hr.exitPermit.gateRegister.directionAll') },
      {
        value: 'ENTRANCE' as const,
        label: formatExitPermitDirection('ENTRANCE', t),
      },
      {
        value: 'EXIT' as const,
        label: formatExitPermitDirection('EXIT', t),
      },
    ],
    [t],
  );

  async function handleOk(): Promise<void> {
    setGenerating(true);
    try {
      const values = await form.validateFields();
      const permitDate = values.permitDate.format('YYYY-MM-DD');
      await openExitPermitGateRegisterPdf(permitDate, values.direction);
      messageApi.success(t('pages.hr.exitPermit.gateRegister.success'));
      onClose();
    } catch {
      messageApi.error(t('pages.hr.exitPermit.gateRegister.error'));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Modal
      rootClassName="erp-hr-travel-modal"
      className="erp-hr-travel-modal"
      title={t('pages.hr.exitPermit.gateRegister.title')}
      open={open}
      onCancel={onClose}
      onOk={() => void handleOk()}
      confirmLoading={generating}
      okText={t('pages.hr.exitPermit.gateRegister.download')}
      destroyOnHidden
      afterOpenChange={(visible) => {
        if (visible) {
          form.setFieldsValue({
            permitDate: dayjs(),
            direction: 'ALL',
          });
        }
      }}
    >
      <p className="text-secondary mb-4 text-sm">
        {t('pages.hr.exitPermit.gateRegister.description')}
      </p>
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item
          name="permitDate"
          label={t('hr.form.date')}
          rules={[
            {
              required: true,
              message: t('hr.validation.dateRequired'),
            },
          ]}
        >
          <DatePicker className="w-full" format="YYYY-MM-DD" />
        </Form.Item>
        <Form.Item
          name="direction"
          label={t('hr.form.direction')}
          rules={[{ required: true }]}
        >
          <Select options={directionOptions} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
