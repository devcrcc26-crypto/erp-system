'use client';

import { Button, Form, Input, InputNumber, Select } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

const CERTIFICATE_TYPES = ['Diploma', 'BSc', 'BA', 'MSc', 'MA', 'PhD'] as const;

export default function EducationRecordsField(): React.ReactNode {
  const { t } = useEpcTranslation();

  return (
    <Form.List name="educationRecords">
      {(fields, { add, remove }) => (
        <div className="erp-emergency-contacts mt-4">
          <div className="erp-emergency-contacts__toolbar">
            <span className="text-sm font-semibold text-slate-700">
              {t('users.form.higherEducation')}
            </span>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={fields.length >= 20}
              onClick={() => add({ instituteName: '' })}
              style={{ borderRadius: 8 }}
            >
              {t('users.form.addEducationRow')}
            </Button>
          </div>
          {fields.length === 0 ? (
            <div className="erp-emergency-contacts__empty">
              {t('users.form.noEducationRecords')}
            </div>
          ) : (
            <div className="erp-emergency-contacts__list">
              {fields.map((field, index) => (
                <div key={field.key} className="erp-emergency-contacts__card">
                  <div className="erp-emergency-contacts__card-head">
                    <span className="erp-users-cell-strong">
                      {t('users.form.higherEducation')} {index + 1}
                    </span>
                    <Button
                      type="text"
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={() => remove(field.name)}
                      aria-label={t('common.delete')}
                    >
                      {t('common.delete')}
                    </Button>
                  </div>
                  <div className="erp-form-grid-2">
                    <Form.Item
                      name={[field.name, 'instituteName']}
                      label={t('users.form.instituteName')}
                      className="mb-0"
                      rules={[{ required: true, message: t('common.required') }]}
                    >
                      <Input maxLength={200} />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'graduationYear']}
                      label={t('users.form.graduationYear')}
                      className="mb-0"
                    >
                      <InputNumber min={1950} max={2100} className="!w-full" />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'subjectMajor']}
                      label={t('users.form.subjectMajor')}
                      className="mb-0"
                    >
                      <Input maxLength={200} />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'certificateType']}
                      label={t('users.form.certificateType')}
                      className="mb-0"
                    >
                      <Select
                        allowClear
                        showSearch
                        className="!w-full"
                        placeholder={t('common.select')}
                        options={CERTIFICATE_TYPES.map((value) => ({
                          value,
                          label: value,
                        }))}
                      />
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
