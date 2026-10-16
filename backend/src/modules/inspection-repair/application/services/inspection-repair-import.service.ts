import { Injectable } from '@nestjs/common';
import {
  InspectionRepairType,
  InspectionRepairUrgency,
} from '@prisma/client';
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
import { SubmitInspectionRepairDto } from '../dtos/inspection-repair.dtos';
import { InspectionRepairService } from './inspection-repair.service';

interface InspectionRepairImportPayload {
  employeeId: string;
  dto: SubmitInspectionRepairDto;
}

const INSPECTION_REPAIR_IMPORT_SCHEMA: ImportColumnSchema = {
  sheetName: 'Inspection & Repair',
  templateFileName: 'inspection-repair-import-template',
  note: 'Each row creates one DRAFT inspection & repair request. Supply either an Asset Serial Number (which must already be assigned to that employee) or a Device Name with its make, model and year.',
  columns: [
    {
      field: 'employeeEmail',
      label: 'Employee Email',
      type: 'email',
      requiredGroup: 'employee',
      example: 'employee@company.local',
      notes: 'Preferred way to identify the requester.',
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
      field: 'assetSerialNumber',
      label: 'Asset Serial Number',
      type: 'string',
      notes:
        'Optional. When supplied, the asset must be currently assigned to this employee and its make, model and year are copied from the register.',
      aliases: ['serialNumber'],
      width: 22,
    },
    {
      field: 'deviceName',
      label: 'Device Name',
      type: 'string',
      maxLength: 200,
      example: 'Generator - Cummins C110',
      notes: 'Required when no Asset Serial Number is given.',
      width: 26,
    },
    {
      field: 'make',
      label: 'Make',
      type: 'string',
      maxLength: 120,
      example: 'Cummins',
      width: 16,
    },
    {
      field: 'model',
      label: 'Model',
      type: 'string',
      maxLength: 120,
      example: 'C110D5',
      width: 16,
    },
    {
      field: 'year',
      label: 'Year',
      type: 'integer',
      min: 1900,
      example: '2022',
      width: 10,
    },
    {
      field: 'location',
      label: 'Location',
      type: 'string',
      required: true,
      maxLength: 200,
      example: 'Adama camp - workshop',
      width: 26,
    },
    {
      field: 'inspectionType',
      label: 'Inspection Type',
      type: 'enum',
      required: true,
      enumValues: [
        InspectionRepairType.INSPECTION,
        InspectionRepairType.MAINTENANCE,
        InspectionRepairType.REPAIR,
      ],
      example: 'Repair',
      width: 18,
    },
    {
      field: 'urgency',
      label: 'Urgency',
      type: 'enum',
      required: true,
      enumValues: [
        InspectionRepairUrgency.CRITICAL,
        InspectionRepairUrgency.URGENT,
        InspectionRepairUrgency.MEDIUM,
        InspectionRepairUrgency.MINOR,
      ],
      example: 'Urgent',
      width: 14,
    },
    {
      field: 'description',
      label: 'Description',
      type: 'string',
      required: true,
      maxLength: 4000,
      example: 'Engine overheats after 30 minutes under load',
      width: 40,
    },
    {
      field: 'solution',
      label: 'Proposed Solution',
      type: 'string',
      maxLength: 4000,
      width: 40,
    },
  ],
};

/**
 * Excel template / preview / commit for inspection & repair requests.
 */
@Injectable()
export class InspectionRepairImportService extends HrModuleImportServiceBase<InspectionRepairImportPayload> {
  constructor(
    excel: HrExcelImportService,
    private readonly prisma: PrismaService,
    private readonly inspectionRepairService: InspectionRepairService,
  ) {
    super(excel);
  }

  protected get schema(): ImportColumnSchema {
    return INSPECTION_REPAIR_IMPORT_SCHEMA;
  }

  protected async planRow(
    ctx: ImportActorContext,
    row: ValidatedImportRow,
  ): Promise<RowPlan<InspectionRepairImportPayload>> {
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
    const label = this.excel.employeeLabel(employee.employee);

    const serialNumber = text('assetSerialNumber').trim().toUpperCase();
    const deviceName = text('deviceName');
    let assetId: string | undefined;

    if (serialNumber) {
      const asset = await this.prisma.companyAsset.findFirst({
        where: activeOnly({ companyId: ctx.companyId, serialNumber }),
        select: { id: true },
      });
      if (!asset) {
        return {
          status: 'error',
          label,
          message: `Asset not found for serial number: ${serialNumber}`,
        };
      }
      const assignment = await this.prisma.assetAssignment.findFirst({
        where: activeOnly({
          companyId: ctx.companyId,
          assetId: asset.id,
          userId: employee.employee.id,
          returnedAt: null,
        }),
        select: { id: true },
      });
      if (!assignment) {
        return {
          status: 'error',
          label,
          message: `Asset ${serialNumber} is not currently assigned to this employee`,
        };
      }
      assetId = asset.id;
    } else if (!deviceName) {
      return {
        status: 'error',
        label,
        message: 'Device Name is required when no Asset Serial Number is given',
      };
    }

    return {
      status: 'ok',
      label,
      dedupeKey: [
        employee.employee.id,
        assetId ?? deviceName.toLowerCase(),
        text('location').toLowerCase(),
        text('inspectionType'),
        text('description').toLowerCase(),
      ].join('|'),
      payload: {
        employeeId: employee.employee.id,
        dto: {
          assetId,
          deviceName: assetId ? undefined : deviceName,
          location: text('location'),
          make: text('make') || undefined,
          model: text('model') || undefined,
          year: num('year'),
          description: text('description'),
          solution: text('solution') || undefined,
          urgency: text('urgency') as InspectionRepairUrgency,
          inspectionType: text('inspectionType') as InspectionRepairType,
        },
      },
    };
  }

  protected async commitRows(
    ctx: ImportActorContext,
    rows: Array<PlannedRow<InspectionRepairImportPayload>>,
  ): Promise<{ created: number; errors: ImportCommitResponseDto['errors'] }> {
    const errors: ImportCommitResponseDto['errors'] = [];
    let created = 0;

    for (const row of rows) {
      try {
        await this.inspectionRepairService.createDraftFromImport(
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
              : 'Failed to import inspection & repair request',
        });
      }
    }

    return { created, errors };
  }
}
