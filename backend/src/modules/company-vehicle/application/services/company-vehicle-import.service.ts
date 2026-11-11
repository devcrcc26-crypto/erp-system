import { Injectable } from '@nestjs/common';
import { FuelType, VehicleType } from '@prisma/client';
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
import { CreateCompanyVehicleDto } from '../dtos/company-vehicle.dtos';
import { CompanyVehicleService } from './company-vehicle.service';

const NEXT_YEAR = new Date().getFullYear() + 1;

const COMPANY_VEHICLE_IMPORT_SCHEMA: ImportColumnSchema = {
  sheetName: 'Company Vehicles',
  templateFileName: 'company-vehicle-import-template',
  note: 'Each row registers one vehicle with status Available. Plate numbers must be unique within the company; rows whose plate number already exists are reported as duplicates and skipped.',
  columns: [
    {
      field: 'plateNumber',
      label: 'Plate Number',
      type: 'string',
      required: true,
      maxLength: 20,
      example: 'AA-12345',
      notes: 'Unique per company. Stored in upper case.',
      aliases: ['plate'],
      width: 18,
    },
    {
      field: 'vehicleType',
      label: 'Vehicle Type',
      type: 'enum',
      required: true,
      enumValues: [
        VehicleType.CAR,
        VehicleType.TRUCK,
        VehicleType.VAN,
        VehicleType.BUS,
        VehicleType.PICKUP,
        VehicleType.MOTORCYCLE,
        VehicleType.OTHER,
      ],
      example: 'Pickup',
      width: 16,
    },
    {
      field: 'make',
      label: 'Make',
      type: 'string',
      required: true,
      maxLength: 100,
      example: 'Toyota',
      width: 18,
    },
    {
      field: 'model',
      label: 'Model',
      type: 'string',
      required: true,
      maxLength: 100,
      example: 'Hilux',
      width: 20,
    },
    {
      field: 'year',
      label: 'Year',
      type: 'integer',
      required: true,
      min: 1900,
      max: NEXT_YEAR,
      example: '2023',
      width: 10,
    },
    {
      field: 'fuelType',
      label: 'Fuel Type',
      type: 'enum',
      enumValues: [
        FuelType.PETROL,
        FuelType.DIESEL,
        FuelType.ELECTRIC,
        FuelType.HYBRID,
      ],
      example: 'Diesel',
      notes: 'Defaults to Diesel when blank.',
      width: 14,
    },
    {
      field: 'color',
      label: 'Color',
      type: 'string',
      maxLength: 50,
      example: 'White',
      width: 14,
    },
    {
      field: 'assignedDriverEmail',
      label: 'Assigned Driver Email',
      type: 'email',
      notes: 'Optional. Must match an active employee.',
      aliases: ['driverEmail'],
      width: 28,
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
      field: 'notes',
      label: 'Notes',
      type: 'string',
      maxLength: 2000,
      width: 36,
    },
  ],
};

/**
 * Excel template / preview / commit for the company vehicle register.
 *
 * Vehicles have no approval workflow - imported rows land in the register with
 * status Available, the register's equivalent of a draft.
 */
@Injectable()
export class CompanyVehicleImportService extends HrModuleImportServiceBase<CreateCompanyVehicleDto> {
  constructor(
    excel: HrExcelImportService,
    private readonly prisma: PrismaService,
    private readonly companyVehicleService: CompanyVehicleService,
  ) {
    super(excel);
  }

  protected get schema(): ImportColumnSchema {
    return COMPANY_VEHICLE_IMPORT_SCHEMA;
  }

  protected async planRow(
    ctx: ImportActorContext,
    row: ValidatedImportRow,
  ): Promise<RowPlan<CreateCompanyVehicleDto>> {
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

    const plateNumber = text('plateNumber').trim().toUpperCase();
    const label = `${plateNumber} - ${text('make')} ${text('model')}`.trim();

    const existing = await this.prisma.companyVehicle.findFirst({
      where: activeOnly({ companyId: ctx.companyId, plateNumber }),
      select: { id: true },
    });
    if (existing) {
      return {
        status: 'duplicate',
        label,
        message: `A vehicle with plate number ${plateNumber} already exists`,
      };
    }

    let assignedDriverId: string | undefined;
    const driverEmail = text('assignedDriverEmail');
    if (driverEmail) {
      const driver = await this.excel.resolveEmployee(ctx.companyId, {
        email: driverEmail,
      });
      if (!driver.ok) {
        return { status: 'error', label, message: `Driver: ${driver.message}` };
      }
      assignedDriverId = driver.employee.id;
    }

    return {
      status: 'ok',
      label,
      dedupeKey: plateNumber,
      payload: {
        plateNumber,
        vehicleType: text('vehicleType') as VehicleType,
        make: text('make'),
        model: text('model'),
        year: num('year') ?? 0,
        fuelType: (text('fuelType') as FuelType) || undefined,
        color: text('color') || undefined,
        assignedDriverId,
        notes: text('notes') || undefined,
        isActive: bool('isActive'),
      },
    };
  }

  protected async commitRows(
    ctx: ImportActorContext,
    rows: Array<PlannedRow<CreateCompanyVehicleDto>>,
  ): Promise<{ created: number; errors: ImportCommitResponseDto['errors'] }> {
    const errors: ImportCommitResponseDto['errors'] = [];
    let created = 0;

    for (const row of rows) {
      try {
        await this.companyVehicleService.createVehicle(
          row.payload,
          ctx.companyId,
          ctx.userId,
        );
        created += 1;
      } catch (error) {
        errors.push({
          line: row.line,
          label: row.label,
          message:
            error instanceof Error ? error.message : 'Failed to import vehicle',
        });
      }
    }

    return { created, errors };
  }
}
