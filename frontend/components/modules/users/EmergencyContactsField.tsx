'use client';

import { Button, Form, Input } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { EmergencyContact } from '@/lib/api/types';

function optionalEmailRule(
  invalidMessage: string,
): { validator: (_: unknown, value: string | undefined) => Promise<void> } {
  return {
    validator: async (_rule, value) => {
      const trimmed = value?.trim() ?? '';
      if (!trimmed) {
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        throw new Error(invalidMessage);
      }
    },
  };
}

export default function EmergencyContactsField(): React.ReactNode {
  const { t } = useEpcTranslation();

  return (
    <Form.List name="emergencyContacts">
      {(fields, { add, remove }) => (
        <div className="erp-emergency-contacts">
          <div className="erp-emergency-contacts__toolbar">
            <span className="erp-users-count-pill">
              {fields.length.toLocaleString()}
            </span>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() =>
                add({
                  firstName: '',
                  lastName: '',
                } as EmergencyContact)
              }
              style={{ borderRadius: 8 }}
            >
              {t('users.form.addEmergencyContactRow')}
            </Button>
          </div>

          {fields.length === 0 ? (
            <div className="erp-emergency-contacts__empty">
              {t('users.form.noEmergencyContacts')}
            </div>
          ) : (
            <div className="erp-emergency-contacts__list">
              {fields.map((field, index) => (
                <div key={field.key} className="erp-emergency-contacts__card">
                  <div className="erp-emergency-contacts__card-head">
                    <span className="erp-users-cell-strong">
                      {t('users.sectionEmergencyContact')} {index + 1}
                    </span>
                    <Button
                      type="text"
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={() => remove(field.name)}
                      aria-label={t('common.delete')}
                      style={{ borderRadius: 8 }}
                    >
                      {t('common.delete')}
                    </Button>
                  </div>
                  <div className="erp-form-grid-3">
                    <Form.Item
                      name={[field.name, 'firstName']}
                      label={t('users.form.emergencyContactFirstName')}
                      className="mb-0"
                      rules={[
                        {
                          required: true,
                          message: t('common.requiredFirstName'),
                        },
                      ]}
                    >
                      <Input />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'middleName']}
                      label={t('users.form.emergencyContactMiddleName')}
                      className="mb-0"
                    >
                      <Input />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'lastName']}
                      label={t('users.form.emergencyContactLastName')}
                      className="mb-0"
                      rules={[
                        {
                          required: true,
                          message: t('common.requiredLastName'),
                        },
                      ]}
                    >
                      <Input />
                    </Form.Item>
                  </div>
                  <div className="erp-form-grid-2 mt-3">
                    <Form.Item
                      name={[field.name, 'phone']}
                      label={t('users.form.emergencyContactPhone')}
                      className="mb-0"
                    >
                      <Input type="tel" />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'email']}
                      label={t('users.form.emergencyContactEmail')}
                      className="mb-0"
                      normalize={(value: string) => value?.trim() ?? ''}
                      rules={[optionalEmailRule(t('common.invalidEmail'))]}
                    >
                      <Input type="email" />
                    </Form.Item>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Form.List>
  );
}

export function formatEmergencyContactName(
  contact: Pick<EmergencyContact, 'firstName' | 'middleName' | 'lastName'>,
): string {
  return [contact.firstName, contact.middleName, contact.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
}

export function normalizeEmergencyContacts(
  contacts?: EmergencyContact[],
): EmergencyContact[] | undefined {
  if (!contacts?.length) {
    return undefined;
  }

  const normalized = contacts
    .map((contact) => ({
      firstName: contact.firstName?.trim() ?? '',
      middleName: contact.middleName?.trim() || undefined,
      lastName: contact.lastName?.trim() ?? '',
      phone: contact.phone?.trim() || undefined,
      email: contact.email?.trim() || undefined,
    }))
    .filter(
      (contact) =>
        contact.firstName ||
        contact.middleName ||
        contact.lastName ||
        contact.phone ||
        contact.email,
    );

  return normalized.length > 0 ? normalized : undefined;
}
