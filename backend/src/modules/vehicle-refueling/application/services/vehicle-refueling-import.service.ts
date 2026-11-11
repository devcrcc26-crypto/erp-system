import { Injectable } from '@nestjs/common';
import { FuelType } from '@prisma/client';
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
import { SubmitVehicleRefuelingDto } from '../dtos/vehicle-refueling.dtos';
import { VehicleRefuelingService } from './vehicle-refueling.service';

interface VehicleRefuelingImportPayload {
  employeeId: string;
  dto: SubmitVehicleRefuelingDto;
}

const VEHICLE_REFUELING_IMPORT_SCHEMA: ImportColumnSchema = {
  sheetName: 'Vehicle Refueling',
  templateFileName: 'vehicle-refueling-import-template',
  note: 'Each row creates one DRAFT refueling request, including its fuel details. Nothing is submitted or approved.',
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
      field: 'driverEmail',
      label: 'Driver Email',
      type: 'email',
      notes: 'Optional driver on the trip.',
      width: 28,
    },
    {
      field: 'fuelDate',
      label: 'Fuel Date',
      type: 'date',
      required: true,
      example: '2026-09-05',
      notes: 'Cannot be in the future.',
      width: 14,
    },
    {
      field: 'fuelType',
      label: 'Fuel Type',
      type: 'enum',
      required: true,
      enumValues: [
        FuelType.PETROL,
        FuelType.DIESEL,
        FuelType.ELECTRIC,
        FuelType.HYBRID,
      ],
      example: 'Diesel',
      width: 14,
    },
    {
      field: 'fuelStation',
      label: 'Fuel Station',
      type: 'string',
      required: true,
      maxLength: 200,
      example: 'TotalEnergies Bole',
      width: 26,
    },
    {
      field: 'currentMileage',
      label: 'Current Mileage (km)',
      type: 'number',
      required: true,
      min: 0,
      example: '48210.5',
      notes: 'Odometer reading at the time of refuelling.',
      width: 20,
    },
    {
      field: 'requestedLitres',
      label: 'Requested Litres',
      type: 'number',
      required: true,
      min: 0,
      example: '60',
      width: 18,
    },
    {
      field: 'unitPriceEtb',
      label: 'Unit Price (ETB)',
      type: 'number',
      min: 0,
      example: '96.5',
      notes: 'Price per litre in ETB. Total cost is calculated for you.',
      width: 18,
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
 * Excel template / preview / commit for vehicle refueling requests.
 */
@Injectable()
export class VehicleRefuelingImportService extends HrModuleImportServiceBase<VehicleRefuelingImportPayload> {
  constructor(
    excel: HrExcelImportService,
    private readonly prisma: PrismaService,
    private readonly vehicleRefuelingService: VehicleRefuelingService,
  ) {
    super(excel);
  }

  protected get schema(): ImportColumnSchema {
    return VEHICLE_REFUELING_IMPORT_SCHEMA;
  }

  protected async planRow(
    ctx: ImportActorContext,
    row: ValidatedImportRow,
  ): Promise<RowPlan<VehicleRefuelingImportPayload>> {
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

    const plateNumber = text('plateNumber');
    const vehicle = await this.prisma.companyVehicle.findFirst({
      where: activeOnly({ companyId: ctx.companyId, plateNumber }),
      select: { id: true },
    });
    if (!vehicle) {
      return {
        status: 'error',
        label,
        message: `Vehicle not found for plate number: ${plateNumber}`,
      };
    }

    let driverId: string | undefined;
    const driverEmail = text('driverEmail');
    if (driverEmail) {
      const driver = await this.excel.resolveEmployee(ctx.companyId, {
        email: driverEmail,
      });
      if (!driver.ok) {
        return { status: 'error', label, message: `Driver: ${driver.message}` };
      }
      driverId = driver.employee.id;
    }

    const fuelDate = text('fuelDate');

    return {
      status: 'ok',
      label,
      dedupeKey: [
        employee.employee.id,
        vehicle.id,
        fuelDate,
        num('requestedLitres'),
        num('currentMileage'),
      ].join('|'),
      payload: {
        employeeId: employee.employee.id,
        dto: {
          vehicleId: vehicle.id,
          driverId,
          fuelDate,
          fuelType: text('fuelType') as FuelType,
          fuelStation: text('fuelStation'),
          currentMileage: num('currentMileage') ?? 0,
          requestedLitres: num('requestedLitres') ?? 0,
          unitPriceEtb: num('unitPriceEtb'),
          notes: text('notes') || undefined,
        },
      },
    };
  }

  protected async commitRows(
    ctx: ImportActorContext,
    rows: Array<PlannedRow<VehicleRefuelingImportPayload>>,
  ): Promise<{ created: number; errors: ImportCommitResponseDto['errors'] }> {
    const errors: ImportCommitResponseDto['errors'] = [];
    let created = 0;

    for (const row of rows) {
      try {
        await this.vehicleRefuelingService.createDraftFromImport(
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
              : 'Failed to import refueling request',
        });
      }
    }

    return { created, errors };
  }
}
