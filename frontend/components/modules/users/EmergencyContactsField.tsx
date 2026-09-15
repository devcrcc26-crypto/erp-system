'use client';

import { Button, Form, Input } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { EmergencyContact } from '@/lib/api/types';
import {
  MAX_EMERGENCY_CONTACTS,
  nameFieldRules,
  optionalEmailRule,
  phoneRules,
} from '@/lib/validation/user-fields';

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
              disabled={fields.length >= MAX_EMERGENCY_CONTACTS}
              onClick={() =>
                add({
                  firstName: '',
                  lastName: '',
                  phone: '',
                } as EmergencyContact)
              }
              style={{ borderRadius: 8 }}
            >
              {t('users.form.addEmergencyContactRow')}
            </Button>
          </div>
          {fields.length >= MAX_EMERGENCY_CONTACTS ? (
            <p className="mb-2 text-xs text-slate-500">
              {t('validation.maxEmergencyContacts', {
                max: MAX_EMERGENCY_CONTACTS,
              })}
            </p>
          ) : null}

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
                      rules={nameFieldRules(t, {
                        required: true,
                        requiredMessage: t('common.requiredFirstName'),
                      })}
                    >
                      <Input />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'middleName']}
                      label={t('users.form.emergencyContactMiddleName')}
                      className="mb-0"
                      rules={nameFieldRules(t, { required: false })}
                    >
                      <Input />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'lastName']}
                      label={t('users.form.emergencyContactLastName')}
                      className="mb-0"
                      rules={nameFieldRules(t, {
                        required: true,
                        requiredMessage: t('common.requiredLastName'),
                      })}
                    >
                      <Input />
                    </Form.Item>
                  </div>
                  <div className="erp-form-grid-2 mt-3">
                    <Form.Item
                      name={[field.name, 'phone']}
                      label={t('users.form.emergencyContactPhone')}
                      className="mb-0"
                      rules={phoneRules(t, { required: true })}
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
