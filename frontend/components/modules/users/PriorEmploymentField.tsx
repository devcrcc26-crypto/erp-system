'use client';

import { Button, DatePicker, Form, Input } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

export default function PriorEmploymentField(): React.ReactNode {
  const { t } = useEpcTranslation();

  return (
    <Form.List name="priorEmployments">
      {(fields, { add, remove }) => (
        <div className="erp-emergency-contacts mt-4">
          <div className="erp-emergency-contacts__toolbar">
            <span className="text-sm font-semibold text-slate-700">
              {t('users.form.priorEmployment')}
            </span>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={fields.length >= 20}
              onClick={() => add({ employerName: '' })}
              style={{ borderRadius: 8 }}
            >
              {t('users.form.addPriorEmploymentRow')}
            </Button>
          </div>
          {fields.length === 0 ? (
            <div className="erp-emergency-contacts__empty">
              {t('users.form.noPriorEmployment')}
            </div>
          ) : (
            <div className="erp-emergency-contacts__list">
              {fields.map((field, index) => (
                <div key={field.key} className="erp-emergency-contacts__card">
                  <div className="erp-emergency-contacts__card-head">
                    <span className="erp-users-cell-strong">
                      {t('users.form.priorEmployment')} {index + 1}
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
                      name={[field.name, 'employerName']}
                      label={t('users.form.employerName')}
                      className="mb-0"
                      rules={[{ required: true, message: t('common.required') }]}
                    >
                      <Input maxLength={200} />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'lastPosition']}
                      label={t('users.form.lastPosition')}
                      className="mb-0"
                    >
                      <Input maxLength={200} />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'dateFrom']}
                      label={t('users.form.dateFrom')}
                      className="mb-0"
                    >
                      <DatePicker className="!w-full" />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'dateTo']}
                      label={t('users.form.dateTo')}
                      className="mb-0"
                    >
                      <DatePicker className="!w-full" />
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
