export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'select'
  | 'multiselect'
  | 'file'
  | 'checkbox'
  | 'currency';

export interface FormField {
  name: string;
  label: string;
  type: FormFieldType | string;
  required?: boolean;
  options?: string[];
  placeholder?: string;
}

export type FormSchemaValues = Record<string, unknown>;

export type FormSchemaErrors = Record<string, string>;
