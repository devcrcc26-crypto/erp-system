/**
 * Shared column-schema vocabulary for HR Excel imports.
 *
 * A module describes its import file once, as an `ImportColumnSchema`, and the
 * shared template builder + parser derive the template workbook, the accepted
 * header aliases, coercion and validation from that single definition.
 */

export type ImportFieldType =
  | 'string'
  | 'number'
  | 'integer'
  | 'date'
  | 'datetime'
  | 'enum'
  | 'email'
  | 'boolean';

export interface ImportColumnDef {
  /** camelCase field key used by the module's mapper. */
  field: string;
  /** Human-readable English header written to the template (e.g. `Request Number`). */
  label: string;
  type: ImportFieldType;
  /** Hard requirement. Use `requiredGroup` when one of several columns will do. */
  required?: boolean;
  /**
   * Name of a "at least one of" group. Rows are valid when any column sharing
   * the group name has a value (e.g. `employeeEmail` / `employeeId`).
   */
  requiredGroup?: string;
  /** Enum member codes. Users may type either the code or its human label. */
  enumValues?: readonly string[];
  /** Overrides for codes whose default humanised label reads badly. */
  enumLabelOverrides?: Readonly<Record<string, string>>;
  min?: number;
  max?: number;
  maxLength?: number;
  /** Value written into the template's example row. */
  example?: string;
  /** Extra text shown on the template's Instructions sheet. */
  notes?: string;
  /** Additional accepted headers beyond the label and the camelCase field. */
  aliases?: readonly string[];
  /** Marks a column as belonging to the repeated line-item block. */
  lineItem?: boolean;
  /** Column width in the generated template. */
  width?: number;
}

export interface ImportColumnSchema {
  /** Worksheet name for the template's data sheet. */
  sheetName: string;
  /** File name (without extension) for the downloaded template. */
  templateFileName: string;
  /** Explanatory note appended to the Instructions sheet. */
  note: string;
  columns: readonly ImportColumnDef[];
  /** Upper bound on data rows accepted from one file. */
  maxRows?: number;
}

export const DEFAULT_MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

/**
 * Turns an enum member code into the human-readable label used in exports and
 * import templates (`SEAL_ISSUED` → `Seal Issued`).
 */
export function humanizeEnumValue(code: string): string {
  return code
    .split('_')
    .filter(Boolean)
    .map(
      (part) =>
        part.charAt(0).toUpperCase() + part.slice(1).toLowerCase(),
    )
    .join(' ');
}

/** Label for an enum code, honouring any per-schema overrides. */
export function enumLabelFor(column: ImportColumnDef, code: string): string {
  return column.enumLabelOverrides?.[code] ?? humanizeEnumValue(code);
}

/** All labels a user may type for an enum column, in template order. */
export function enumLabelsFor(column: ImportColumnDef): string[] {
  return (column.enumValues ?? []).map((code) => enumLabelFor(column, code));
}

/**
 * Normalises a header cell or enum value for lookup: lower-cased, with runs of
 * whitespace, underscores and hyphens collapsed away entirely. `Request Number`,
 * `request_number` and `requestNumber` all collapse to `requestnumber`.
 */
export function normalizeLookupKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

/** Every header spelling accepted for a column. */
export function acceptedHeadersFor(column: ImportColumnDef): string[] {
  return [
    column.label,
    column.field,
    ...(column.aliases ?? []),
  ];
}

/** Builds the normalized header → field lookup for a schema. */
export function buildHeaderLookup(
  schema: ImportColumnSchema,
): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const column of schema.columns) {
    for (const header of acceptedHeadersFor(column)) {
      lookup.set(normalizeLookupKey(header), column.field);
    }
  }
  return lookup;
}
