'use client';

import { useState } from 'react';
import { Alert, Button, Form, Input, Modal, Space } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import { MetaItem } from '@/components/modules/hr/shared/hr-page-chrome';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import {
  useSetLoginNameToFullName,
  useUpdateLoginName,
} from '@/lib/query/users';

function normalizeLoginName(value: string): string {
  return value
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function formatFullName(parts: {
  firstName: string;
  middleName?: string | null;
  lastName?: string | null;
}): string {
  return [parts.firstName, parts.middleName, parts.lastName]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter((part) => part.length > 0)
    .join(' ');
}

interface EmployeeLoginNameFieldProps {
  userId: string;
  loginName: string | null | undefined;
  firstName: string;
  middleName?: string | null;
  lastName?: string | null;
  /** HR/admin may edit; self profile is read-only. */
  canEdit: boolean;
}

/**
 * Displays OA login name with HR edit / set-to-full-name actions.
 */
export default function EmployeeLoginNameField({
  userId,
  loginName,
  firstName,
  middleName,
  lastName,
  canEdit,
}: EmployeeLoginNameFieldProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const updateLoginName = useUpdateLoginName();
  const setToFullName = useSetLoginNameToFullName();
  const [editOpen, setEditOpen] = useState(false);
  const [form] = Form.useForm<{ loginName: string }>();

  const fullName = formatFullName({ firstName, middleName, lastName });
  const differs =
    Boolean(loginName) &&
    Boolean(fullName) &&
    normalizeLoginName(loginName!) !== normalizeLoginName(fullName);

  async function handleSave(): Promise<void> {
    try {
      const values = await form.validateFields();
      await updateLoginName.mutateAsync({
        userId,
        loginName: values.loginName.trim(),
      });
      messageApi.success(t('users.loginNameUpdated'));
      setEditOpen(false);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        messageApi.error(error.message);
      } else if (
        error &&
        typeof error === 'object' &&
        'errorFields' in error
      ) {
        return;
      } else {
        messageApi.error(t('users.loginNameUpdateError'));
      }
    }
  }

  async function handleUseFullName(): Promise<void> {
    try {
      await setToFullName.mutateAsync(userId);
      messageApi.success(t('users.loginNameUpdated'));
      setEditOpen(false);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        messageApi.error(error.message);
      } else {
        messageApi.error(t('users.loginNameUpdateError'));
      }
    }
  }

  return (
    <div className="sm:col-span-2">
      <MetaItem label={t('users.loginName')}>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span>
              {loginName?.trim()
                ? loginName
                : t('users.loginNameNotSet')}
            </span>
            {canEdit ? (
              <Space size={4} wrap>
                <Button
                  type="link"
                  size="small"
                  icon={<EditOutlined />}
                  className="!px-0"
                  onClick={() => {
                    form.setFieldsValue({
                      loginName: loginName ?? fullName,
                    });
                    setEditOpen(true);
                  }}
                >
                  {t('common.edit')}
                </Button>
                {!loginName?.trim() && fullName ? (
                  <Button
                    type="link"
                    size="small"
                    className="!px-0"
                    loading={setToFullName.isPending}
                    onClick={() => void handleUseFullName()}
                  >
                    {t('users.loginNameSetToFullName')}
                  </Button>
                ) : null}
              </Space>
            ) : null}
          </div>
          {canEdit && differs ? (
            <Alert
              type="warning"
              showIcon
              className="!py-1"
              title={t('users.loginNameDiffersWarning')}
              action={
                <Button
                  size="small"
                  type="link"
                  loading={setToFullName.isPending}
                  onClick={() => void handleUseFullName()}
                >
                  {t('users.loginNameUseFullName')}
                </Button>
              }
            />
          ) : null}
        </div>
      </MetaItem>

      <Modal
        open={editOpen}
        title={t('users.loginNameEditTitle')}
        okText={t('common.save')}
        confirmLoading={updateLoginName.isPending}
        onOk={() => void handleSave()}
        onCancel={() => setEditOpen(false)}
        destroyOnHidden
        rootClassName="erp-hr-travel-modal"
        className="erp-hr-travel-modal"
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item
            name="loginName"
            label={t('users.loginName')}
            rules={[
              { required: true, message: t('users.loginNameRequired') },
            ]}
            extra={t('users.loginNameEditHint')}
          >
            <Input autoComplete="off" />
          </Form.Item>
        </Form>
        {fullName ? (
          <Button
            type="link"
            className="!px-0"
            loading={setToFullName.isPending}
            onClick={() => {
              form.setFieldsValue({ loginName: fullName });
            }}
          >
            {t('users.loginNameUseFullName')}
          </Button>
        ) : null}
      </Modal>
    </div>
  );
}
