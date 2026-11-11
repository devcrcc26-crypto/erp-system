import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
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
import {
  CreateExitPermitDto,
  CreateExitPermitItemDto,
  ExitPermitDirection,
} from '../dtos/exit-permit.dto';
import { ExitPermitService } from './exit-permit.service';

interface ExitPermitImportPayload {
  /** Rows sharing this key are folded into one permit. */
  groupKey: string;
  header: {
    employeeId: string;
    departmentId?: string;
    direction: ExitPermitDirection;
    date?: string;
  };
  item: CreateExitPermitItemDto;
}

const EXIT_PERMIT_IMPORT_SCHEMA: ImportColumnSchema = {
  sheetName: 'Exit Permits',
  templateFileName: 'exit-permit-import-template',
  note: 'One row per item. Repeat the employee, direction, date and department columns on every row of the same permit - rows that share all four are folded into a single DRAFT permit with several items. Nothing is submitted or approved.',
  maxRows: 1000,
  columns: [
    {
      field: 'employeeEmail',
      label: 'Employee Email',
      type: 'email',
      requiredGroup: 'employee',
      example: 'employee@company.local',
      notes: 'Preferred way to identify the permit holder.',
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
    {
      field: 'direction',
      label: 'Direction',
      type: 'enum',
      required: true,
      enumValues: [ExitPermitDirection.EXIT, ExitPermitDirection.ENTRANCE],
      example: 'Exit',
      width: 14,
    },
    {
      field: 'date',
      label: 'Date',
      type: 'date',
      example: '2026-09-08',
      notes: 'Optional. Today or a future date (YYYY-MM-DD). Defaults to today when blank.',
      width: 14,
    },
    {
      field: 'department',
      label: 'Department',
      type: 'string',
      example: 'Logistics',
      notes: 'Optional. Must match an existing department name or code.',
      width: 22,
    },
    {
      field: 'itemName',
      label: 'Item Name',
      type: 'string',
      required: true,
      maxLength: 100,
      example: 'Angle grinder',
      notes: 'One item per row.',
      lineItem: true,
      width: 26,
    },
    {
      field: 'issue',
      label: 'Issue',
      type: 'string',
      maxLength: 100,
      example: 'Returning after repair',
      lineItem: true,
      width: 26,
    },
    {
      field: 'quantity',
      label: 'Quantity',
      type: 'number',
      min: 1,
      example: '2',
      notes: 'Defaults to 1 when blank.',
      lineItem: true,
      width: 12,
    },
    {
      field: 'unit',
      label: 'Unit',
      type: 'string',
      maxLength: 100,
      example: 'pcs',
      lineItem: true,
      width: 12,
    },
  ],
};

/**
 * Excel template / preview / commit for equipment & materials exit permits.
 *
 * The file is item-level: rows repeating the same employee, direction, date
 * and department are folded into one DRAFT permit carrying all their items.
 */
@Injectable()
export class ExitPermitImportService extends HrModuleImportServiceBase<ExitPermitImportPayload> {
  constructor(
    excel: HrExcelImportService,
    private readonly prisma: PrismaService,
    private readonly exitPermitService: ExitPermitService,
  ) {
    super(excel);
  }

  protected get schema(): ImportColumnSchema {
    return EXIT_PERMIT_IMPORT_SCHEMA;
  }

  protected async planRow(
    ctx: ImportActorContext,
    row: ValidatedImportRow,
  ): Promise<RowPlan<ExitPermitImportPayload>> {
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
    const label = `${this.excel.employeeLabel(employee.employee)} - ${text('itemName')}`;

    let departmentId: string | undefined;
    const departmentName = text('department');
    if (departmentName) {
      const department = await this.prisma.department.findFirst({
        where: activeOnly({
          companyId: ctx.companyId,
          OR: [{ name: departmentName }, { code: departmentName }],
        }),
        select: { id: true },
      });
      if (!department) {
        return {
          status: 'error',
          label,
          message: `Department not found: ${departmentName}`,
        };
      }
      departmentId = department.id;
    }

    const direction = text('direction') as ExitPermitDirection;
    const date = text('date');
    const groupKey = [
      employee.employee.id,
      direction,
      date || 'today',
      departmentId ?? '',
    ].join('|');

    return {
      status: 'ok',
      label,
      dedupeKey: [
        groupKey,
        text('itemName').toLowerCase(),
        text('issue').toLowerCase(),
        num('quantity') ?? 1,
        text('unit').toLowerCase(),
      ].join('|'),
      payload: {
        groupKey,
        header: {
          employeeId: employee.employee.id,
          departmentId,
          direction,
          date: date || undefined,
        },
        item: {
          itemName: text('itemName'),
          issue: text('issue') || undefined,
          quantity: num('quantity') ?? 1,
          unit: text('unit') || undefined,
        },
      },
    };
  }

  protected async commitRows(
    ctx: ImportActorContext,
    rows: Array<PlannedRow<ExitPermitImportPayload>>,
  ): Promise<{ created: number; errors: ImportCommitResponseDto['errors'] }> {
    const errors: ImportCommitResponseDto['errors'] = [];
    let created = 0;

    for (const group of groupRows(rows)) {
      const dto: CreateExitPermitDto = {
        employeeId: group.header.employeeId,
        departmentId: group.header.departmentId,
        direction: group.header.direction,
        date: group.header.date,
        items: group.items,
      };

      try {
        await this.exitPermitService.createDraft(dto, ctx.companyId, ctx.userId);
        created += 1;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to import exit permit';
        for (const row of group.rows) {
          errors.push({ line: row.line, label: row.label, message });
        }
      }
    }

    return { created, errors };
  }
}

/** Folds item rows into one permit per group key, preserving file order. */
function groupRows(rows: Array<PlannedRow<ExitPermitImportPayload>>): Array<{
  header: ExitPermitImportPayload['header'];
  items: CreateExitPermitItemDto[];
  rows: Array<PlannedRow<ExitPermitImportPayload>>;
}> {
  const groups = new Map<
    string,
    {
      header: ExitPermitImportPayload['header'];
      items: CreateExitPermitItemDto[];
      rows: Array<PlannedRow<ExitPermitImportPayload>>;
    }
  >();

  for (const row of rows) {
    const existing = groups.get(row.payload.groupKey);
    if (existing) {
      existing.items.push(row.payload.item);
      existing.rows.push(row);
      continue;
    }
    groups.set(row.payload.groupKey, {
      header: row.payload.header,
      items: [row.payload.item],
      rows: [row],
    });
  }

  return [...groups.values()];
}
