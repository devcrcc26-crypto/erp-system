import { Injectable } from '@nestjs/common';
import { LeaveType } from '@prisma/client';
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
  CreateLeavePolicyDto,
  LeavePolicyRuleDto,
} from '../dtos/leave-policy.dtos';
import { LeavePolicyService } from './leave-policy.service';

interface LeavePolicyImportPayload {
  /** Rows sharing this key become one policy. */
  groupKey: string;
  header: {
    name: string;
    description?: string;
    governedBy?: string;
    isActive?: boolean;
  };
  rule: LeavePolicyRuleDto;
}

const LEAVE_POLICY_IMPORT_SCHEMA: ImportColumnSchema = {
  sheetName: 'Leave Policies',
  templateFileName: 'leave-policy-import-template',
  note: 'One row per leave-type rule. Repeat the policy columns on every row of the same policy - rows sharing a Policy Name become one policy with several rules. A policy name that already exists is skipped.',
  maxRows: 1000,
  columns: [
    {
      field: 'name',
      label: 'Policy Name',
      type: 'string',
      required: true,
      maxLength: 200,
      example: 'Standard Leave',
      notes: 'Rows with the same name are folded into one policy.',
      aliases: ['policyName'],
      width: 28,
    },
    {
      field: 'description',
      label: 'Description',
      type: 'string',
      maxLength: 1000,
      example: 'Default entitlement for permanent staff',
      width: 40,
    },
    {
      field: 'governedBy',
      label: 'Governed By',
      type: 'string',
      maxLength: 500,
      example: 'Ethiopian Labour Proclamation No. 1156/2019',
      width: 34,
    },
    {
      field: 'isActive',
      label: 'Active',
      type: 'boolean',
      example: 'Yes',
      notes: 'Yes or No. Defaults to Yes.',
      width: 12,
    },
    {
      field: 'leaveType',
      label: 'Leave Type',
      type: 'enum',
      required: true,
      enumValues: [LeaveType.ANNUAL, LeaveType.MATERNITY, LeaveType.SICK],
      example: 'Annual',
      width: 16,
    },
    {
      field: 'baseDays',
      label: 'Base Days',
      type: 'number',
      required: true,
      min: 0,
      example: '16',
      notes: 'Entitlement before any progressive increment.',
      width: 14,
    },
    {
      field: 'isProgressive',
      label: 'Progressive',
      type: 'boolean',
      example: 'Yes',
      notes: 'Yes when the entitlement grows with years of service.',
      width: 14,
    },
    {
      field: 'incrementDays',
      label: 'Increment Days',
      type: 'number',
      min: 0,
      example: '1',
      notes: 'Days added per increment period. Required when Progressive is Yes.',
      width: 18,
    },
    {
      field: 'incrementEveryYears',
      label: 'Increment Every (Years)',
      type: 'integer',
      min: 1,
      example: '2',
      notes: 'Required when Progressive is Yes.',
      width: 22,
    },
    {
      field: 'minimumServiceMonths',
      label: 'Minimum Service (Months)',
      type: 'integer',
      min: 0,
      example: '12',
      width: 24,
    },
    {
      field: 'maxDaysCap',
      label: 'Max Days Cap',
      type: 'number',
      min: 0,
      example: '30',
      width: 16,
    },
    {
      field: 'maxCarryForwardDays',
      label: 'Max Carry Forward Days',
      type: 'number',
      min: 0,
      example: '10',
      width: 22,
    },
    {
      field: 'requiresReceipt',
      label: 'Requires Receipt',
      type: 'boolean',
      example: 'No',
      notes: 'Yes when supporting evidence must be attached (e.g. sick leave).',
      width: 18,
    },
  ],
};

/**
 * Excel template / preview / commit for leave policies.
 *
 * The file is rule-level: rows sharing a policy name are folded into one
 * policy carrying all of their per-leave-type rules.
 */
@Injectable()
export class LeavePolicyImportService extends HrModuleImportServiceBase<LeavePolicyImportPayload> {
  constructor(
    excel: HrExcelImportService,
    private readonly prisma: PrismaService,
    private readonly leavePolicyService: LeavePolicyService,
  ) {
    super(excel);
  }

  protected get schema(): ImportColumnSchema {
    return LEAVE_POLICY_IMPORT_SCHEMA;
  }

  protected async planRow(
    ctx: ImportActorContext,
    row: ValidatedImportRow,
  ): Promise<RowPlan<LeavePolicyImportPayload>> {
    const text = (field: string): string =>
      typeof row.values[field] === 'string' ? (row.values[field] as string) : '';
    const num = (field: string): number | undefined =>
      typeof row.values[field] === 'number'
        ? (row.values[field] as number)
        : undefined;
    const bool = (field: string): boolean | undefined =>
      typeof row.values[field] === 'boolean'
        ? (row.values[field] as boolean)
        : undefined;

    const name = text('name');
    const leaveType = text('leaveType') as LeaveType;
    const label = `${name} - ${leaveType}`;

    const existing = await this.prisma.leavePolicy.findFirst({
      where: activeOnly({ companyId: ctx.companyId, name }),
      select: { id: true },
    });
    if (existing) {
      return {
        status: 'duplicate',
        label,
        message: `A leave policy named "${name}" already exists`,
      };
    }

    const isProgressive = bool('isProgressive') ?? false;
    if (
      isProgressive &&
      (num('incrementDays') === undefined ||
        num('incrementEveryYears') === undefined)
    ) {
      return {
        status: 'error',
        label,
        message:
          'Increment Days and Increment Every (Years) are required when Progressive is Yes',
      };
    }

    return {
      status: 'ok',
      label,
      dedupeKey: `${name.toLowerCase()}|${leaveType}`,
      payload: {
        groupKey: name.toLowerCase(),
        header: {
          name,
          description: text('description') || undefined,
          governedBy: text('governedBy') || undefined,
          isActive: bool('isActive'),
        },
        rule: {
          leaveType,
          baseDays: num('baseDays') ?? 0,
          isProgressive,
          incrementDays: num('incrementDays'),
          incrementEveryYears: num('incrementEveryYears'),
          minimumServiceMonths: num('minimumServiceMonths'),
          maxDaysCap: num('maxDaysCap'),
          maxCarryForwardDays: num('maxCarryForwardDays'),
          requiresReceipt: bool('requiresReceipt'),
        },
      },
    };
  }

  protected async commitRows(
    ctx: ImportActorContext,
    rows: Array<PlannedRow<LeavePolicyImportPayload>>,
  ): Promise<{ created: number; errors: ImportCommitResponseDto['errors'] }> {
    const errors: ImportCommitResponseDto['errors'] = [];
    let created = 0;

    const groups = new Map<
      string,
      {
        header: LeavePolicyImportPayload['header'];
        rules: LeavePolicyRuleDto[];
        rows: Array<PlannedRow<LeavePolicyImportPayload>>;
      }
    >();

    for (const row of rows) {
      const group = groups.get(row.payload.groupKey);
      if (group) {
        group.rules.push(row.payload.rule);
        group.rows.push(row);
        continue;
      }
      groups.set(row.payload.groupKey, {
        header: row.payload.header,
        rules: [row.payload.rule],
        rows: [row],
      });
    }

    for (const group of groups.values()) {
      const dto: CreateLeavePolicyDto = {
        name: group.header.name,
        description: group.header.description,
        governedBy: group.header.governedBy,
        isActive: group.header.isActive,
        rules: group.rules,
      };

      try {
        await this.leavePolicyService.createPolicy(
          dto,
          ctx.companyId,
          ctx.userId,
        );
        created += 1;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to import leave policy';
        for (const row of group.rows) {
          errors.push({ line: row.line, label: row.label, message });
        }
      }
    }

    return { created, errors };
  }
}
