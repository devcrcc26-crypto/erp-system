import { Injectable } from '@nestjs/common';
import { ImportCommitResponseDto } from '../../../hr-shared/application/dtos/hr-import.dtos';
import {
  HrExcelImportService,
  type ValidatedImportRow,
} from '../../../hr-shared/application/import-export/hr-excel-import.service';
import type { ImportActorContext } from '../../../hr-shared/application/import-export/hr-import-controller.factory';
import {
  HrModuleImportServiceBase,
  type PlannedRow,
  type RowPlan,
} from '../../../hr-shared/application/import-export/hr-module-import.service-base';
import type { ImportColumnSchema } from '../../../hr-shared/application/import-export/import-column-schema';
import { UpsertEmployeePerDiemRateDto } from '../dtos/employee-per-diem-rate.dtos';
import { EmployeePerDiemRateService } from './employee-per-diem-rate.service';

interface EmployeePerDiemRateImportPayload {
  employeeId: string;
  dto: UpsertEmployeePerDiemRateDto;
}

/** Destination categories, in the order the rate form shows them. */
const CATEGORIES = [
  { field: 'domesticRate', active: 'domesticActive', label: 'Domestic' },
  { field: 'regionalRate', active: 'regionalActive', label: 'Regional' },
  {
    field: 'internationalRate',
    active: 'internationalActive',
    label: 'International',
  },
] as const;

const EMPLOYEE_PER_DIEM_RATE_IMPORT_SCHEMA: ImportColumnSchema = {
  sheetName: 'Per Diem Rates',
  templateFileName: 'employee-per-diem-rate-import-template',
  note: 'One row per employee. Each row replaces that employee\'s per diem rate card. Leave a rate blank to clear it; set the matching Active column to No to keep the figure but stop it being used.',
  columns: [
    {
      field: 'employeeEmail',
      label: 'Employee Email',
      type: 'email',
      requiredGroup: 'employee',
      example: 'employee@company.local',
      notes: 'Preferred way to identify the employee.',
      width: 28,
    },
    {
      field: 'employeeId',
      label: 'Employee ID',
      type: 'string',
      requiredGroup: 'employee',
      notes: 'User UUID. Only needed when Employee Email is blank.',
      width: 36,
    },
    ...CATEGORIES.flatMap((category) => [
      {
        field: category.field,
        label: `${category.label} Rate (ETB)`,
        type: 'number' as const,
        min: 0,
        example: category.field === 'domesticRate' ? '1200' : undefined,
        notes: `Daily rate in ETB for ${category.label.toLowerCase()} travel.`,
        width: 22,
      },
      {
        field: category.active,
        label: `${category.label} Active`,
        type: 'boolean' as const,
        example: category.field === 'domesticRate' ? 'Yes' : undefined,
        notes: 'Yes or No. Defaults to Yes when a rate is given.',
        width: 20,
      },
    ]),
  ],
};

/**
 * Excel template / preview / commit for employee per diem rate cards.
 *
 * Rates are master data with no approval workflow, so a row upserts that
 * employee's card directly.
 */
@Injectable()
export class EmployeePerDiemRateImportService extends HrModuleImportServiceBase<EmployeePerDiemRateImportPayload> {
  constructor(
    excel: HrExcelImportService,
    private readonly rateService: EmployeePerDiemRateService,
  ) {
    super(excel);
  }

  protected get schema(): ImportColumnSchema {
    return EMPLOYEE_PER_DIEM_RATE_IMPORT_SCHEMA;
  }

  protected async planRow(
    ctx: ImportActorContext,
    row: ValidatedImportRow,
  ): Promise<RowPlan<EmployeePerDiemRateImportPayload>> {
    const employee = await this.excel.resolveEmployee(ctx.companyId, {
      email:
        typeof row.values.employeeEmail === 'string'
          ? row.values.employeeEmail
          : undefined,
      id:
        typeof row.values.employeeId === 'string'
          ? row.values.employeeId
          : undefined,
    });
    if (!employee.ok) {
      return {
        status: 'error',
        label: row.raw.employeeEmail ?? '',
        message: employee.message,
      };
    }

    const dto: Record<string, number | boolean | null> = {};
    let hasRate = false;

    for (const category of CATEGORIES) {
      const rate = row.values[category.field];
      const active = row.values[category.active];

      if (typeof rate === 'number') {
        dto[category.field] = rate;
        hasRate = true;
      } else {
        dto[category.field] = null;
      }
      if (typeof active === 'boolean') {
        dto[category.active] = active;
      } else if (typeof rate === 'number') {
        dto[category.active] = true;
      }
    }

    const label = this.excel.employeeLabel(employee.employee);
    if (!hasRate) {
      return {
        status: 'error',
        label,
        message: 'At least one destination rate is required',
      };
    }

    return {
      status: 'ok',
      label,
      dedupeKey: employee.employee.id,
      payload: {
        employeeId: employee.employee.id,
        dto: dto as UpsertEmployeePerDiemRateDto,
      },
    };
  }

  protected async commitRows(
    ctx: ImportActorContext,
    rows: Array<PlannedRow<EmployeePerDiemRateImportPayload>>,
  ): Promise<{ created: number; errors: ImportCommitResponseDto['errors'] }> {
    const errors: ImportCommitResponseDto['errors'] = [];
    let created = 0;

    for (const row of rows) {
      try {
        await this.rateService.upsertForEmployee(
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
              : 'Failed to import per diem rate',
        });
      }
    }

    return { created, errors };
  }
}
