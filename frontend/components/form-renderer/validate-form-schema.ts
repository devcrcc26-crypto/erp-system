import type {
  FormField,
  FormSchemaErrors,
  FormSchemaValues,
} from '@/components/form-renderer/types';

/**
 * Returns validation errors for required fields that are empty.
 */
export function validateFormSchemaFields(
  fields: FormField[],
  values: FormSchemaValues,
): FormSchemaErrors {
  const errors: FormSchemaErrors = {};

  for (const field of fields) {
    if (!field.required) {
      continue;
    }
    const value = values[field.name];
    if (isEmptyFormValue(value, field.type)) {
      errors[field.name] = `${field.label} is required`;
    }
  }

  return errors;
}

export function isEmptyFormValue(
  value: unknown,
  fieldType: string,
): boolean {
  if (fieldType === 'checkbox') {
    return value !== true;
  }
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === 'string') {
    return value.trim().length === 0;
  }
  if (typeof value === 'number') {
    return Number.isNaN(value);
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return false;
}

/**
 * Normalizes category formSchema into a flat fields array.
 */
export function normalizeFormSchemaFields(
  schema: { fields?: FormField[] } | FormField[] | null | undefined,
): FormField[] {
  if (!schema) {
    return [];
  }
  if (Array.isArray(schema)) {
    return schema;
  }
  return Array.isArray(schema.fields) ? schema.fields : [];
}
