'use client';

import {
  Checkbox,
  DatePicker,
  Input,
  InputNumber,
  Select,
  Space,
  Typography,
} from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import type {
  FormField,
  FormSchemaErrors,
  FormSchemaValues,
} from '@/components/form-renderer/types';
import { tokens } from '@/lib/theme/tokens';

export type { FormField, FormFieldType, FormSchemaErrors, FormSchemaValues } from '@/components/form-renderer/types';
export {
  normalizeFormSchemaFields,
  validateFormSchemaFields,
} from '@/components/form-renderer/validate-form-schema';

export interface FormSchemaRendererProps {
  fields: FormField[];
  values: FormSchemaValues;
  onChange: (values: FormSchemaValues) => void;
  errors?: FormSchemaErrors;
  disabled?: boolean;
}

/**
 * Renders dynamic form fields from a JSON form schema.
 * Reusable across Approvals, RFI, closeout, and other modules.
 */
export default function FormSchemaRenderer({
  fields,
  values,
  onChange,
  errors = {},
  disabled = false,
}: FormSchemaRendererProps): React.ReactNode {
  function setFieldValue(name: string, value: unknown): void {
    onChange({
      ...values,
      [name]: value,
    });
  }

  if (fields.length === 0) {
    return (
      <Typography.Text type="secondary">
        This category has no form fields configured.
      </Typography.Text>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {fields.map((field) => {
        const error = errors[field.name];
        return (
          <div key={field.name} className="flex flex-col gap-1.5">
            <label
              htmlFor={`form-schema-${field.name}`}
              className="text-[13px] font-medium"
              style={{ color: tokens.colorTextPrimary }}
            >
              {field.label}
              {field.required ? (
                <span style={{ color: tokens.colorRed600, marginLeft: 4 }}>
                  *
                </span>
              ) : null}
            </label>
            {renderFieldInput(field, values[field.name], setFieldValue, disabled)}
            {error ? (
              <Typography.Text type="danger" style={{ fontSize: 12 }}>
                {error}
              </Typography.Text>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function renderFieldInput(
  field: FormField,
  value: unknown,
  setFieldValue: (name: string, value: unknown) => void,
  disabled: boolean,
): React.ReactNode {
  const id = `form-schema-${field.name}`;
  const options = (field.options ?? []).map((option) => ({
    value: option,
    label: option,
  }));

  switch (field.type) {
    case 'textarea':
      return (
        <Input.TextArea
          id={id}
          rows={4}
          disabled={disabled}
          placeholder={field.placeholder}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => setFieldValue(field.name, event.target.value)}
        />
      );

    case 'number':
      return (
        <InputNumber
          id={id}
          className="w-full"
          disabled={disabled}
          placeholder={field.placeholder}
          value={typeof value === 'number' ? value : undefined}
          onChange={(next) => setFieldValue(field.name, next)}
        />
      );

    case 'currency':
      return (
        <Space.Compact className="w-full">
          <Input
            disabled
            value="ETB"
            style={{ width: 64, textAlign: 'center' }}
          />
          <InputNumber
            id={id}
            className="w-full"
            disabled={disabled}
            placeholder={field.placeholder}
            min={0}
            precision={2}
            value={typeof value === 'number' ? value : undefined}
            onChange={(next) => setFieldValue(field.name, next)}
          />
        </Space.Compact>
      );

    case 'date':
      return (
        <DatePicker
          id={id}
          className="w-full"
          format="DD/MM/YYYY"
          disabled={disabled}
          value={toDayjs(value)}
          onChange={(next: Dayjs | null) =>
            setFieldValue(
              field.name,
              next ? next.format('YYYY-MM-DD') : undefined,
            )
          }
        />
      );

    case 'select':
      return (
        <Select
          id={id}
          className="w-full"
          allowClear
          disabled={disabled}
          placeholder={field.placeholder ?? `Select ${field.label}`}
          options={options}
          value={typeof value === 'string' ? value : undefined}
          onChange={(next: string | undefined) =>
            setFieldValue(field.name, next)
          }
        />
      );

    case 'multiselect':
      return (
        <Select
          id={id}
          className="w-full"
          mode="multiple"
          allowClear
          disabled={disabled}
          placeholder={field.placeholder ?? `Select ${field.label}`}
          options={options}
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={(next: string[]) => setFieldValue(field.name, next)}
        />
      );

    case 'checkbox':
      return (
        <Checkbox
          id={id}
          disabled={disabled}
          checked={value === true}
          onChange={(event) => setFieldValue(field.name, event.target.checked)}
        >
          {field.placeholder ?? field.label}
        </Checkbox>
      );

    case 'file':
      return (
        <div className="flex flex-col gap-1">
          <Input
            id={id}
            type="file"
            disabled={disabled}
            onChange={(event) => {
              const file = event.target.files?.[0];
              setFieldValue(field.name, file?.name ?? undefined);
            }}
          />
          {typeof value === 'string' && value ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Selected: {value}
            </Typography.Text>
          ) : null}
        </div>
      );

    case 'text':
    default:
      return (
        <Input
          id={id}
          disabled={disabled}
          placeholder={field.placeholder}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => setFieldValue(field.name, event.target.value)}
        />
      );
  }
}

function toDayjs(value: unknown): Dayjs | null {
  if (typeof value !== 'string' || !value) {
    return null;
  }
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed : null;
}
