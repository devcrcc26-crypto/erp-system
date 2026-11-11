import { buildImportTemplate } from './excel-template.builder';
import {
  HrExcelImportService,
  type ValidatedImportRow,
} from './hr-excel-import.service';
import type {
  HrModuleImportService,
  ImportActorContext,
} from './hr-import-controller.factory';
import type { ImportColumnSchema } from './import-column-schema';
import {
  ImportCommitResponseDto,
  ImportPreviewResponseDto,
  ImportRowPreviewDto,
} from '../dtos/hr-import.dtos';

/** Outcome of planning a single spreadsheet row. */
export type RowPlan<TPayload> =
  | {
      status: 'ok';
      label: string;
      payload: TPayload;
      /** Rows sharing a key are flagged as duplicates within the file. */
      dedupeKey?: string;
    }
  | { status: 'error' | 'duplicate'; label: string; message: string };

/** An `ok` row carried through to the commit phase. */
export interface PlannedRow<TPayload> {
  line: number;
  label: string;
  payload: TPayload;
}

/**
 * Base class for HR module import services.
 *
 * It owns the parts every module shares - template generation, parsing against
 * the column schema, per-row validation reporting, duplicate detection within
 * a file, and the preview/commit response shapes. A module subclass supplies
 * its schema, a `planRow` mapper, and a `commitRows` writer that calls its own
 * `createDraft*` service method.
 */
export abstract class HrModuleImportServiceBase<TPayload>
  implements HrModuleImportService
{
  protected constructor(protected readonly excel: HrExcelImportService) {}

  /** Column definitions describing the module's import file. */
  protected abstract get schema(): ImportColumnSchema;

  /**
   * Validates one parsed row against module rules (employee lookup, referenced
   * records, cross-field constraints) and produces the draft payload.
   */
  protected abstract planRow(
    ctx: ImportActorContext,
    row: ValidatedImportRow,
  ): Promise<RowPlan<TPayload>>;

  /**
   * Writes the accepted rows as DRAFT records. Implementations must not submit
   * or approve anything.
   */
  protected abstract commitRows(
    ctx: ImportActorContext,
    rows: Array<PlannedRow<TPayload>>,
  ): Promise<{ created: number; errors: ImportCommitResponseDto['errors'] }>;

  async buildTemplate(): Promise<Buffer> {
    return buildImportTemplate(this.schema);
  }

  async previewImport(
    ctx: ImportActorContext,
    file: Express.Multer.File,
  ): Promise<ImportPreviewResponseDto> {
    const { preview } = await this.plan(ctx, file);
    return preview;
  }

  async commitImport(
    ctx: ImportActorContext,
    file: Express.Multer.File,
  ): Promise<ImportCommitResponseDto> {
    const { preview, accepted } = await this.plan(ctx, file);
    const skipped = preview.rows.length - accepted.length;

    if (accepted.length === 0) {
      return { created: 0, skipped, errors: [] };
    }

    const { created, errors } = await this.commitRows(ctx, accepted);
    return { created, skipped: skipped + errors.length, errors };
  }

  /** Parses, validates and plans every row in one pass. */
  private async plan(
    ctx: ImportActorContext,
    file: Express.Multer.File,
  ): Promise<{
    preview: ImportPreviewResponseDto;
    accepted: Array<PlannedRow<TPayload>>;
  }> {
    const rows = await this.excel.parse(file, this.schema);
    const previewRows: ImportRowPreviewDto[] = [];
    const accepted: Array<PlannedRow<TPayload>> = [];
    const seenKeys = new Set<string>();

    for (const row of rows) {
      const fallbackLabel = this.fallbackLabel(row);

      if (row.errors.length > 0) {
        previewRows.push({
          line: row.line,
          label: fallbackLabel,
          status: 'error',
          message: row.errors.join('; '),
        });
        continue;
      }

      const plan = await this.planRow(ctx, row);
      if (plan.status !== 'ok') {
        previewRows.push({
          line: row.line,
          label: plan.label || fallbackLabel,
          status: plan.status,
          message: plan.message,
        });
        continue;
      }

      if (plan.dedupeKey && seenKeys.has(plan.dedupeKey)) {
        previewRows.push({
          line: row.line,
          label: plan.label || fallbackLabel,
          status: 'duplicate_in_file',
          message: 'An identical row appears earlier in this file',
        });
        continue;
      }
      if (plan.dedupeKey) {
        seenKeys.add(plan.dedupeKey);
      }

      previewRows.push({
        line: row.line,
        label: plan.label || fallbackLabel,
        status: 'ok',
      });
      accepted.push({
        line: row.line,
        label: plan.label || fallbackLabel,
        payload: plan.payload,
      });
    }

    const valid = previewRows.filter((row) => row.status === 'ok').length;
    const duplicate = previewRows.filter(
      (row) => row.status === 'duplicate' || row.status === 'duplicate_in_file',
    ).length;

    return {
      preview: {
        valid,
        invalid: previewRows.length - valid - duplicate,
        duplicate,
        rows: previewRows,
      },
      accepted,
    };
  }

  /** First non-empty cell, so an invalid row is still recognisable. */
  private fallbackLabel(row: ValidatedImportRow): string {
    for (const column of this.schema.columns) {
      const value = row.raw[column.field]?.trim();
      if (value) {
        return value;
      }
    }
    return `Line ${row.line}`;
  }
}
