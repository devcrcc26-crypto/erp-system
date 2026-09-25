'use client';

import { useEffect } from 'react';
import { Button, Drawer, Form, Input, Switch } from 'antd';
import {
  useCreatePosition,
  useUpdatePosition,
  type Position,
} from '@/lib/query/org';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface PositionFormValues {
  title: string;
  titleZh?: string;
  isActive: boolean;
}

export default function PositionFormDrawer({
  open,
  editing,
  readOnly,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: Position | null;
  readOnly: boolean;
  onClose: () => void;
  onSaved: () => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const [form] = Form.useForm<PositionFormValues>();
  const messageApi = useAppMessage();
  const createPosition = useCreatePosition();
  const updatePosition = useUpdatePosition();

  useEffect(() => {
    if (!open) {
      return;
    }
    if (editing) {
      form.setFieldsValue({
        title: editing.title,
        titleZh: editing.titleZh ?? undefined,
        isActive: editing.isActive,
      });
      return;
    }
    form.resetFields();
    form.setFieldsValue({ isActive: true });
  }, [editing, form, open]);

  async function handleSubmit(values: PositionFormValues): Promise<void> {
    try {
      if (editing) {
        await updatePosition.mutateAsync({
          id: editing.id,
          body: {
            title: values.title.trim(),
            titleZh: values.titleZh?.trim() || undefined,
            isActive: values.isActive,
          },
        });
        messageApi.success(t('pages.positions.updated'));
      } else {
        await createPosition.mutateAsync({
          title: values.title.trim(),
          titleZh: values.titleZh?.trim() || undefined,
          isActive: values.isActive,
        });
        messageApi.success(t('pages.positions.created'));
      }
      onSaved();
      onClose();
    } catch (error) {
      notifyApiError(
        error,
        editing
          ? t('pages.positions.updateFailed')
          : t('pages.positions.createFailed'),
        messageApi,
      );
    }
  }

  return (
    <Drawer
      open={open}
      title={
        readOnly
          ? t('pages.positions.viewPosition')
          : editing
            ? t('pages.positions.editPosition')
            : t('pages.positions.addPosition')
      }
      size={480}
      className="erp-responsive-drawer"
      onClose={onClose}
      destroyOnHidden
      extra={
        readOnly ? null : (
          <Button
            type="primary"
            loading={createPosition.isPending || updatePosition.isPending}
            onClick={() => form.submit()}
            style={{ borderRadius: 0 }}
          >
            {t('common.save')}
          </Button>
        )
      }
    >
      <Form<PositionFormValues>
        form={form}
        layout="vertical"
        disabled={readOnly}
        onFinish={(values) => void handleSubmit(values)}
      >
        <Form.Item
          label={t('pages.positions.form.title')}
          name="title"
          rules={[
            { required: true, message: t('pages.positions.form.titleRequired') },
          ]}
        >
          <Input placeholder={t('pages.positions.form.titlePlaceholder')} />
        </Form.Item>
        <Form.Item label={t('pages.positions.form.titleZh')} name="titleZh">
          <Input placeholder={t('pages.positions.form.titleZhPlaceholder')} />
        </Form.Item>
        <Form.Item
          label={t('common.active')}
          name="isActive"
          valuePropName="checked"
        >
          <Switch disabled={readOnly} />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
