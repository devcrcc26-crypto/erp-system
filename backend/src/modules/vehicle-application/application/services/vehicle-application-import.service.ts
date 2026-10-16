import { Injectable } from '@nestjs/common';
import { DriveType } from '@prisma/client';
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
import { SubmitVehicleApplicationDto } from '../dtos/vehicle-application.dtos';
import { VehicleApplicationService } from './vehicle-application.service';

interface VehicleApplicationImportPayload {
  employeeId: string;
  dto: SubmitVehicleApplicationDto;
}

const VEHICLE_APPLICATION_IMPORT_SCHEMA: ImportColumnSchema = {
  sheetName: 'Vehicle Applications',
  templateFileName: 'vehicle-application-import-template',
  note: 'Each row creates one DRAFT vehicle application. Nothing is submitted or approved - review and submit each draft from the list page.',
  columns: [
    {
      field: 'employeeEmail',
      label: 'Employee Email',
      type: 'email',
      requiredGroup: 'employee',
      example: 'employee@company.local',
      notes: 'Preferred way to identify the applicant.',
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
      field: 'plateNumber',
      label: 'Vehicle Plate Number',
      type: 'string',
      required: true,
      example: 'AA-12345',
      notes: 'Must match an active company vehicle.',
      aliases: ['vehiclePlate', 'plate'],
      width: 20,
    },
    {
      field: 'driveType',
      label: 'Drive Type',
      type: 'enum',
      required: true,
      enumValues: [DriveType.COMPANY_DRIVER, DriveType.SELF_DRIVE],
      example: 'Company Driver',
      width: 18,
    },
    {
      field: 'driverEmail',
      label: 'Driver Email',
      type: 'email',
      notes:
        'Required for Company Driver unless the vehicle already has an assigned driver.',
      width: 28,
    },
    {
      field: 'departureDatetime',
      label: 'Departure Date/Time',
      type: 'datetime',
      required: true,
      example: '2026-09-10 08:00',
      width: 20,
    },
    {
      field: 'returnDatetime',
      label: 'Return Date/Time',
      type: 'datetime',
      required: true,
      example: '2026-09-10 17:30',
      notes: 'Must be after the departure date/time.',
      width: 20,
    },
    {
      field: 'destination',
      label: 'Destination',
      type: 'string',
      required: true,
      maxLength: 200,
      example: 'Adama site office',
      width: 28,
    },
    {
      field: 'purpose',
      label: 'Purpose',
      type: 'string',
      required: true,
      maxLength: 4000,
      example: 'Site inspection and material handover',
      width: 36,
    },
    {
      field: 'passengerCount',
      label: 'Passenger Count',
      type: 'integer',
      min: 1,
      example: '3',
      notes: 'Defaults to 1 when blank.',
      width: 16,
    },
    {
      field: 'passengerNames',
      label: 'Passenger Names',
      type: 'string',
      maxLength: 2000,
      example: 'Abebe Kebede, Li Wei, Sara Tesfaye',
      notes: 'Comma-separated list of passengers.',
      width: 36,
    },
    {
      field: 'projectCode',
      label: 'Project Code',
      type: 'string',
      notes: 'Optional. Must match an active project code.',
      width: 16,
    },
    {
      field: 'notes',
      label: 'Notes',
      type: 'string',
      maxLength: 2000,
      width: 36,
    },
  ],
};

/**
 * Excel template / preview / commit for vehicle applications.
 */
@Injectable()
export class VehicleApplicationImportService extends HrModuleImportServiceBase<VehicleApplicationImportPayload> {
  constructor(
    excel: HrExcelImportService,
    private readonly prisma: PrismaService,
    private readonly vehicleApplicationService: VehicleApplicationService,
  ) {
    super(excel);
  }

  protected get schema(): ImportColumnSchema {
    return VEHICLE_APPLICATION_IMPORT_SCHEMA;
  }

  protected async planRow(
    ctx: ImportActorContext,
    row: ValidatedImportRow,
  ): Promise<RowPlan<VehicleApplicationImportPayload>> {
    const value = (field: string): string =>
      typeof row.values[field] === 'string'
        ? (row.values[field] as string)
        : '';

    const employee = await this.excel.resolveEmployee(ctx.companyId, {
      email: value('employeeEmail'),
      id: value('employeeId'),
    });
    if (!employee.ok) {
      return { status: 'error', label: row.raw.employeeEmail ?? '', message: employee.message };
    }
    const label = this.excel.employeeLabel(employee.employee);

    const plateNumber = value('plateNumber');
    const vehicle = await this.prisma.companyVehicle.findFirst({
      where: activeOnly({ companyId: ctx.companyId, plateNumber }),
      select: { id: true, assignedDriverId: true },
    });
    if (!vehicle) {
      return {
        status: 'error',
        label,
        message: `Vehicle not found for plate number: ${plateNumber}`,
      };
    }

    const driveType = value('driveType') as DriveType;
    let driverId: string | undefined;
    const driverEmail = value('driverEmail');
    if (driverEmail) {
      const driver = await this.excel.resolveEmployee(ctx.companyId, {
        email: driverEmail,
      });
      if (!driver.ok) {
        return { status: 'error', label, message: `Driver: ${driver.message}` };
      }
      driverId = driver.employee.id;
    }
    if (
      driveType === DriveType.COMPANY_DRIVER &&
      !driverId &&
      !vehicle.assignedDriverId
    ) {
      return {
        status: 'error',
        label,
        message:
          'Driver Email is required when Drive Type is Company Driver and the vehicle has no assigned driver',
      };
    }

    const departure = value('departureDatetime');
    const returnDatetime = value('returnDatetime');
    if (
      new Date(returnDatetime.replace(' ', 'T')) <=
      new Date(departure.replace(' ', 'T'))
    ) {
      return {
        status: 'error',
        label,
        message: 'Return Date/Time must be after Departure Date/Time',
      };
    }

    let projectId: string | undefined;
    const projectCode = value('projectCode');
    if (projectCode) {
      const project = await this.prisma.project.findFirst({
        where: activeOnly({ companyId: ctx.companyId, projectCode }),
        select: { id: true },
      });
      if (!project) {
        return {
          status: 'error',
          label,
          message: `Project not found for code: ${projectCode}`,
        };
      }
      projectId = project.id;
    }

    const passengerCount =
      typeof row.values.passengerCount === 'number'
        ? row.values.passengerCount
        : undefined;

    return {
      status: 'ok',
      label,
      dedupeKey: [
        employee.employee.id,
        vehicle.id,
        departure,
        returnDatetime,
        value('destination').toLowerCase(),
      ].join('|'),
      payload: {
        employeeId: employee.employee.id,
        dto: {
          vehicleId: vehicle.id,
          driveType,
          driverId,
          departureDatetime: toIso(departure),
          returnDatetime: toIso(returnDatetime),
          destination: value('destination'),
          purpose: value('purpose'),
          passengerCount,
          passengerNames: value('passengerNames') || undefined,
          projectId,
          notes: value('notes') || undefined,
        },
      },
    };
  }

  protected async commitRows(
    ctx: ImportActorContext,
    rows: Array<PlannedRow<VehicleApplicationImportPayload>>,
  ): Promise<{ created: number; errors: ImportCommitResponseDto['errors'] }> {
    const errors: ImportCommitResponseDto['errors'] = [];
    let created = 0;

    for (const row of rows) {
      try {
        await this.vehicleApplicationService.createDraftFromImport(
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
              : 'Failed to import vehicle application',
        });
      }
    }

    return { created, errors };
  }
}

/** `2026-09-10 08:00` → an ISO string the DTO validator accepts. */
function toIso(value: string): string {
  const normalized = value.includes(' ') ? value.replace(' ', 'T') : value;
  const withTime = normalized.includes('T') ? normalized : `${normalized}T00:00`;
  return new Date(`${withTime}${withTime.endsWith('Z') ? '' : 'Z'}`).toISOString();
}
