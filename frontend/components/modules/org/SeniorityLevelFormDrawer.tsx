'use client';

import './org-v2.css';

import { useEffect } from 'react';
import { Button, Drawer, Form, Input, InputNumber, Switch } from 'antd';
import { TeamOutlined } from '@ant-design/icons';
import {
  useCreateSeniorityLevel,
  useUpdateSeniorityLevel,
  type SeniorityLevel,
} from '@/lib/query/org';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { detailDrawerStyles } from '@/lib/theme/layout';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface LevelFormValues {
  name: string;
  nameZh?: string;
  sortOrder?: number;
  isActive: boolean;
}

/** Add / edit / view a seniority level - same drawer as Positions. */
export default function SeniorityLevelFormDrawer({
  open,
  editing,
  readOnly,
  nextSortOrder,
  onClose,
}: {
  open: boolean;
  editing: SeniorityLevel | null;
  readOnly: boolean;
  /** Default display order for a new level (after the last one). */
  nextSortOrder: number;
  onClose: () => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const [form] = Form.useForm<LevelFormValues>();
  const messageApi = useAppMessage();
  const createLevel = useCreateSeniorityLevel();
  const updateLevel = useUpdateSeniorityLevel();
  const saving = createLevel.isPending || updateLevel.isPending;

  useEffect(() => {
    if (!open) {
      return;
    }
    if (editing) {
      form.setFieldsValue({
        name: editing.name,
        nameZh: editing.nameZh ?? '',
        sortOrder: editing.sortOrder,
        isActive: editing.isActive,
      });
      return;
    }
    form.resetFields();
    form.setFieldsValue({ sortOrder: nextSortOrder, isActive: true });
  }, [editing, form, nextSortOrder, open]);

  async function handleSubmit(values: LevelFormValues): Promise<void> {
    const body = {
      name: values.name.trim(),
      nameZh: values.nameZh?.trim() ?? '',
      sortOrder: values.sortOrder ?? 0,
      isActive: values.isActive,
    };
    try {
      if (editing) {
        await updateLevel.mutateAsync({ id: editing.id, body });
        messageApi.success(t('pages.seniorityLevels.updated'));
      } else {
        await createLevel.mutateAsync(body);
        messageApi.success(t('pages.seniorityLevels.created'));
      }
      onClose();
    } catch (error: unknown) {
      notifyApiError(
        error,
        editing
          ? t('pages.seniorityLevels.updateFailed')
          : t('pages.seniorityLevels.createFailed'),
        messageApi,
      );
    }
  }

  const drawerTitle = readOnly
    ? t('pages.seniorityLevels.view')
    : editing
      ? t('pages.seniorityLevels.edit')
      : t('pages.seniorityLevels.add');

  return (
    <Drawer
      open={open}
      size={480}
      className="erp-responsive-drawer erp-org-drawer erp-position-drawer"
      rootClassName="erp-org-drawer"
      styles={detailDrawerStyles}
      onClose={onClose}
      destroyOnHidden
      title={
        <div className="min-w-0">
          <div className="text-[15px] font-semibold leading-snug">
            {drawerTitle}
          </div>
          {editing ? (
            <span className="erp-org-drawer-meta">
              <TeamOutlined aria-hidden />
              {t('pages.seniorityLevels.peopleCount', {
                count: editing._count?.users ?? 0,
              })}
            </span>
          ) : (
            <p className="erp-org-drawer-hint">
              {t('pages.seniorityLevels.description')}
            </p>
          )}
        </div>
      }
      footer={
        readOnly ? (
          <div className="erp-org-drawer-footer flex justify-end">
            <Button onClick={onClose}>{t('common.cancel')}</Button>
          </div>
        ) : (
          <div className="erp-org-drawer-footer flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={onClose} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button
              type="primary"
              loading={saving}
              onClick={() => form.submit()}
            >
              {editing ? t('common.save') : t('pages.seniorityLevels.add')}
            </Button>
          </div>
        )
      }
    >
      <Form<LevelFormValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        disabled={readOnly}
        onFinish={(values) => void handleSubmit(values)}
        className="erp-position-drawer-form"
      >
        <Form.Item
          label={t('pages.seniorityLevels.form.name')}
          name="name"
          rules={[
            {
              required: true,
              whitespace: true,
              message: t('pages.seniorityLevels.form.nameRequired'),
            },
            { max: 100 },
          ]}
        >
          <Input placeholder={t('pages.seniorityLevels.form.namePlaceholder')} />
        </Form.Item>
        <Form.Item
          label={t('pages.seniorityLevels.form.nameZh')}
          name="nameZh"
          rules={[{ max: 100 }]}
        >
          <Input placeholder={t('pages.seniorityLevels.form.nameZhPlaceholder')} />
        </Form.Item>
        <Form.Item
          label={t('pages.seniorityLevels.form.sortOrder')}
          name="sortOrder"
          extra={t('pages.seniorityLevels.form.sortOrderHelp')}
        >
          <InputNumber min={0} max={999} precision={0} className="w-full" />
        </Form.Item>
        <Form.Item
          label={t('common.active')}
          name="isActive"
          valuePropName="checked"
          extra={t('pages.seniorityLevels.form.activeHelp')}
        >
          <Switch disabled={readOnly} />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
