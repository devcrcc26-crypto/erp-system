import { Injectable } from '@nestjs/common';
import { SealUrgency } from '@prisma/client';
import { ImportCommitResponseDto } from '@/modules/hr-shared/application/dtos/hr-import.dtos';
import {
  HrExcelImportService,
  type ValidatedImportRow,
} from '@/modules/hr-shared/application/import-export/hr-excel-import.service';
import type { ImportActorContext } from '@/modules/hr-shared/application/import-export/hr-import-controller.factory';
import {
  HrModuleImportServiceBase,
  type PlannedRow,
  type RowPlan,
} from '@/modules/hr-shared/application/import-export/hr-module-import.service-base';
import type { ImportColumnSchema } from '@/modules/hr-shared/application/import-export/import-column-schema';
import { buildSealImportColumns } from '@/modules/hr-shared/application/import-export/seal-import-columns';
import { SubmitOfficialSealRequestDto } from '../dtos/official-seal.dtos';
import { OfficialSealService } from './official-seal.service';

interface OfficialSealImportPayload {
  employeeId: string;
  dto: SubmitOfficialSealRequestDto;
}

const OFFICIAL_SEAL_IMPORT_SCHEMA: ImportColumnSchema = {
  sheetName: 'Official Seal Usage',
  templateFileName: 'official-seal-import-template',
  note: 'Each row creates one DRAFT official seal usage request. Attachments cannot be imported - add the document to the draft before submitting it.',
  columns: buildSealImportColumns('official'),
};

/**
 * Excel template / preview / commit for official seal usage requests.
 */
@Injectable()
export class OfficialSealImportService extends HrModuleImportServiceBase<OfficialSealImportPayload> {
  constructor(
    excel: HrExcelImportService,
    private readonly officialSealService: OfficialSealService,
  ) {
    super(excel);
  }

  protected get schema(): ImportColumnSchema {
    return OFFICIAL_SEAL_IMPORT_SCHEMA;
  }

  protected async planRow(
    ctx: ImportActorContext,
    row: ValidatedImportRow,
  ): Promise<RowPlan<OfficialSealImportPayload>> {
    const text = (field: string): string =>
      typeof row.values[field] === 'string' ? (row.values[field] as string) : '';
    const num = (field: string): number | undefined =>
      typeof row.values[field] === 'number'
        ? (row.values[field] as number)
        : undefined;

    const employee = await this.excel.resolveEmployee(ctx.companyId, {
      email: text('employeeEmail'),
      id: text('employeeId'),
    });
    if (!employee.ok) {
      return {
        status: 'error',
        label: row.raw.employeeEmail ?? '',
        message: employee.message,
      };
    }

    const fileName = text('fileName');
    return {
      status: 'ok',
      label: `${this.excel.employeeLabel(employee.employee)} - ${fileName}`,
      dedupeKey: [
        employee.employee.id,
        fileName.toLowerCase(),
        text('dateNeeded'),
      ].join('|'),
      payload: {
        employeeId: employee.employee.id,
        dto: {
          fileName,
          description: text('description'),
          sealCategory: text('sealCategory') || undefined,
          copyCount: num('copyCount'),
          urgency: text('urgency') as SealUrgency,
          dateNeeded: text('dateNeeded'),
        },
      },
    };
  }

  protected async commitRows(
    ctx: ImportActorContext,
    rows: Array<PlannedRow<OfficialSealImportPayload>>,
  ): Promise<{ created: number; errors: ImportCommitResponseDto['errors'] }> {
    const errors: ImportCommitResponseDto['errors'] = [];
    let created = 0;

    for (const row of rows) {
      try {
        await this.officialSealService.createDraftFromImport(
          row.payload.employeeId,
          row.payload.dto,
          ctx.companyId,
          ctx.userId,
        );
        created += 1;
      } catch (error) {
        errors.push({
          line: row.line,
          label: row.label,
          message:
            error instanceof Error
              ? error.message
              : 'Failed to import official seal request',
        });
      }
    }

    return { created, errors };
  }
}
