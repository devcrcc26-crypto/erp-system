'use client';

import { Form, Input, InputNumber, Select } from 'antd';
import type { FormInstance } from 'antd';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  SEAL_CATEGORY_OTHER,
  sealCategorySelectOptions,
} from '@/lib/utils/seal-category';

interface SealRequestExtraFieldsProps {
  form: FormInstance;
}

/**
 * Category (preset or custom) and copy count for seal usage requests.
 */
export default function SealRequestExtraFields({
  form,
}: SealRequestExtraFieldsProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const categoryPreset = Form.useWatch('sealCategoryPreset', form) as
    | string
    | undefined;

  const categoryOptions = sealCategorySelectOptions(t);

  return (
    <>
      <div className="erp-form-grid-2">
        <Form.Item
          name="sealCategoryPreset"
          label={t('hr.form.sealCategory')}
        >
          <Select
            allowClear
            placeholder={t('hr.placeholder.selectSealCategory')}
            options={categoryOptions}
          />
        </Form.Item>
        <Form.Item name="copyCount" label={t('hr.form.copyCount')}>
          <InputNumber min={1} className="w-full" placeholder="1" />
        </Form.Item>
      </div>
      {categoryPreset === SEAL_CATEGORY_OTHER ? (
        <Form.Item
          name="sealCategoryOther"
          label={t('hr.form.sealCategoryOther')}
          rules={[
            {
              required: true,
              message: t('hr.validation.sealCategoryOtherRequired'),
            },
          ]}
        >
          <Input
            maxLength={200}
            placeholder={t('hr.placeholder.enterSealCategoryOther')}
          />
        </Form.Item>
      ) : null}
    </>
  );
}
