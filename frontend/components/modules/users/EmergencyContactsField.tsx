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
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-[2px] border border-[rgba(0,0,0,0.06)]">
            <table className="w-full min-w-[880px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[rgba(0,0,0,0.06)] bg-[#fafafa] text-left text-[rgba(0,0,0,0.65)]">
                  <th className="px-3 py-2 font-medium">
                    {t('users.form.emergencyContactFirstName')}
                  </th>
                  <th className="px-3 py-2 font-medium">
                    {t('users.form.emergencyContactMiddleName')}
                  </th>
                  <th className="px-3 py-2 font-medium">
                    {t('users.form.emergencyContactLastName')}
                  </th>
                  <th className="px-3 py-2 font-medium">
                    {t('users.form.emergencyContactPhone')}
                  </th>
                  <th className="px-3 py-2 font-medium">
                    {t('users.form.emergencyContactEmail')}
                  </th>
                  <th className="px-3 py-2 font-medium">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {fields.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-[rgba(0,0,0,0.45)]">
                      {t('users.form.noEmergencyContacts')}
                    </td>
                  </tr>
                ) : (
                  fields.map((field) => (
                    <tr key={field.key} className="border-b border-[rgba(0,0,0,0.06)] align-top last:border-b-0">
                      <td className="px-3 py-2">
                        <Form.Item
                          name={[field.name, 'firstName']}
                          className="mb-0"
                          rules={[{ required: true, message: t('common.requiredFirstName') }]}
                        >
                          <Input size="small" />
                        </Form.Item>
                      </td>
                      <td className="px-3 py-2">
                        <Form.Item name={[field.name, 'middleName']} className="mb-0">
                          <Input size="small" />
                        </Form.Item>
                      </td>
                      <td className="px-3 py-2">
                        <Form.Item
                          name={[field.name, 'lastName']}
                          className="mb-0"
                          rules={[{ required: true, message: t('common.requiredLastName') }]}
                        >
                          <Input size="small" />
                        </Form.Item>
                      </td>
                      <td className="px-3 py-2">
                        <Form.Item name={[field.name, 'phone']} className="mb-0">
                          <Input size="small" type="tel" />
                        </Form.Item>
                      </td>
                      <td className="px-3 py-2">
                        <Form.Item
                          name={[field.name, 'email']}
                          className="mb-0"
                          normalize={(value: string) => value?.trim() ?? ''}
                          rules={[optionalEmailRule(t('common.invalidEmail'))]}
                        >
                          <Input size="small" type="email" />
                        </Form.Item>
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          type="link"
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          onClick={() => remove(field.name)}
                        >
                          {t('common.delete')}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Button
            type="dashed"
            block
            icon={<PlusOutlined />}
            onClick={() => add({} as EmergencyContact)}
          >
            {t('users.form.addEmergencyContactRow')}
          </Button>
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
