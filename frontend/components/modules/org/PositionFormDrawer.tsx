'use client';

import { useEffect } from 'react';
import { Button, Drawer, Form, Input, Select, Switch } from 'antd';
import {
  useCreatePosition,
  useDepartments,
  useUpdatePosition,
  type Position,
} from '@/lib/query/org';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface PositionFormValues {
  departmentId: string;
  title: string;
  titleZh?: string;
  grade?: string;
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
  const departmentsQuery = useDepartments({ page: 1, limit: 100 }, open);
  const departmentOptions = (departmentsQuery.data?.data ?? []).map((department) => ({
    value: department.id,
    label: department.nameZh
      ? `${department.name} / ${department.nameZh}`
      : department.name,
  }));

  useEffect(() => {
    if (!open) {
      return;
    }
    if (editing) {
      form.setFieldsValue({
        departmentId: editing.departmentId,
        title: editing.title,
        titleZh: editing.titleZh ?? undefined,
        grade: editing.grade ?? undefined,
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
            departmentId: values.departmentId,
            title: values.title.trim(),
            titleZh: values.titleZh?.trim() || undefined,
            grade: values.grade?.trim() || undefined,
            isActive: values.isActive,
          },
        });
        messageApi.success(t('pages.positions.updated'));
      } else {
        await createPosition.mutateAsync({
          departmentId: values.departmentId,
          title: values.title.trim(),
          titleZh: values.titleZh?.trim() || undefined,
          grade: values.grade?.trim() || undefined,
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
          label={t('pages.positions.form.department')}
          name="departmentId"
          rules={[
            {
              required: true,
              message: t('pages.positions.form.departmentRequired'),
            },
          ]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            loading={departmentsQuery.isLoading}
            placeholder={t('pages.positions.form.departmentPlaceholder')}
            options={departmentOptions}
          />
        </Form.Item>
        <Form.Item
          label={t('pages.positions.form.title')}
          name="title"
          rules={[
            { required: true, message: t('pages.positions.form.titleRequired') },
          ]}
        >
          <Input placeholder={t('pages.positions.form.titlePlaceholder')} />
        </Form.Item>
        <Form.Item
          label={t('pages.positions.form.titleZh')}
          name="titleZh"
        >
          <Input placeholder={t('pages.positions.form.titleZhPlaceholder')} />
        </Form.Item>
        <Form.Item label={t('pages.positions.form.grade')} name="grade">
          <Input placeholder={t('pages.positions.form.gradePlaceholder')} />
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
