'use client';

import { useMemo, useState } from 'react';
import { DatePicker, Form, Modal, Select } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useHrPdfContext } from '@/hooks/use-hr-pdf-context';
import type { ExitPermitListItem } from '@/lib/api/exit-permit.types';
import { fetchExitPermitDetails } from '@/lib/query/exit-permit';
import {
  filterExitPermitsForGateRegister,
  exportExitPermitGateRegisterPdf,
  type ExitPermitGateRegisterDirection,
} from '@/lib/utils/exit-permit-gate-register-pdf';
import { formatExitPermitDirection } from '@/lib/utils/exit-permit-display';

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
  const pdfContext = useHrPdfContext();
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
      const direction = values.direction;

      const candidateIds = listRows
        .filter((row) => {
          if (row.status !== 'APPROVED') {
            return false;
          }
          if ((row.date ?? '').slice(0, 10) !== permitDate) {
            return false;
          }
          if (direction !== 'ALL' && row.direction !== direction) {
            return false;
          }
          return true;
        })
        .map((row) => row.id);

      if (candidateIds.length === 0) {
        messageApi.warning(t('pages.hr.exitPermit.gateRegister.empty'));
        return;
      }

      const details = await fetchExitPermitDetails(candidateIds);
      const permits = filterExitPermitsForGateRegister(
        details,
        permitDate,
        direction,
      );

      if (permits.length === 0) {
        messageApi.warning(t('pages.hr.exitPermit.gateRegister.empty'));
        return;
      }

      exportExitPermitGateRegisterPdf({
        permitDate,
        direction,
        permits,
        companyName: pdfContext.companyName,
        preparedBy: pdfContext.preparedBy,
        directionLabels: {
          ENTRANCE: formatExitPermitDirection('ENTRANCE', t),
          EXIT: formatExitPermitDirection('EXIT', t),
        },
        labels: {
          documentTitle: t('pages.hr.exitPermit.gateRegister.title'),
          subtitleForDirection: (directionLabel, dateLabel) =>
            t('pages.hr.exitPermit.gateRegister.subtitle', {
              direction: directionLabel,
              date: dateLabel,
            }),
          generatedAt: t('pages.hr.exitPermit.gateRegister.generatedAt'),
          preparedBy: t('pages.hr.exitPermit.gateRegister.preparedBy'),
          approvedOnly: t('pages.hr.exitPermit.gateRegister.approvedOnly'),
          permitCount: (count) =>
            t('pages.hr.exitPermit.gateRegister.permitCount', { count }),
          sectionEntrance: formatExitPermitDirection('ENTRANCE', t),
          sectionExit: formatExitPermitDirection('EXIT', t),
          noPermits: t('pages.hr.exitPermit.gateRegister.empty'),
          gateVerified: t('pages.hr.exitPermit.gateRegister.verified'),
          footer: t('pages.hr.exitPermit.gateRegister.footer'),
          page: t('pages.hr.exitPermit.gateRegister.page'),
          of: t('pages.hr.exitPermit.gateRegister.of'),
        },
      });

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
