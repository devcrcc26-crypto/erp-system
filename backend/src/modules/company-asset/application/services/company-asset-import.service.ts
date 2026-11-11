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
import { CreateCompanyAssetDto } from '../dtos/company-asset.dtos';
import { CompanyAssetService } from './company-asset.service';

const NEXT_YEAR = new Date().getFullYear() + 1;

const COMPANY_ASSET_IMPORT_SCHEMA: ImportColumnSchema = {
  sheetName: 'Company Assets',
  templateFileName: 'company-asset-import-template',
  note: 'Each row registers one asset with status Available. Serial numbers must be unique within the company; rows whose serial number already exists are reported as duplicates and skipped.',
  columns: [
    {
      field: 'serialNumber',
      label: 'Serial Number',
      type: 'string',
      required: true,
      maxLength: 50,
      example: 'SN-2026-00184',
      notes: 'Unique per company. Stored in upper case.',
      width: 22,
    },
    {
      field: 'assetName',
      label: 'Asset Name',
      type: 'string',
      maxLength: 200,
      example: 'Site engineer laptop',
      width: 26,
    },
    {
      field: 'assetCode',
      label: 'Asset Code',
      type: 'string',
      maxLength: 100,
      example: 'IT-LAP-0184',
      width: 18,
    },
    {
      field: 'cardNumber',
      label: 'Card Number',
      type: 'string',
      maxLength: 100,
      width: 18,
    },
    {
      field: 'brand',
      label: 'Brand',
      type: 'string',
      required: true,
      maxLength: 100,
      example: 'Lenovo',
      width: 18,
    },
    {
      field: 'model',
      label: 'Model',
      type: 'string',
      required: true,
      maxLength: 100,
      example: 'ThinkPad T14',
      width: 20,
    },
    {
      field: 'year',
      label: 'Year',
      type: 'integer',
      required: true,
      min: 1900,
      max: NEXT_YEAR,
      example: '2025',
      width: 10,
    },
    {
      field: 'color',
      label: 'Color',
      type: 'string',
      required: true,
      maxLength: 50,
      example: 'Black',
      width: 14,
    },
    {
      field: 'type',
      label: 'Type',
      type: 'string',
      required: true,
      maxLength: 100,
      example: 'Laptop',
      notes: 'Free-text asset type, e.g. Laptop, Generator, Vehicle.',
      width: 18,
    },
    {
      field: 'assetCategory',
      label: 'Asset Category',
      type: 'string',
      maxLength: 200,
      example: 'IT Equipment',
      width: 22,
    },
    {
      field: 'specifications',
      label: 'Specifications',
      type: 'string',
      maxLength: 500,
      example: 'i7 / 32 GB RAM / 1 TB SSD',
      width: 32,
    },
    {
      field: 'description',
      label: 'Description',
      type: 'string',
      maxLength: 2000,
      width: 32,
    },
    {
      field: 'startUseDate',
      label: 'Start Use Date',
      type: 'date',
      example: '2026-01-15',
      notes: 'Depreciation is calculated from this date.',
      width: 16,
    },
    {
      field: 'usefulLifeMonths',
      label: 'Useful Life (Months)',
      type: 'integer',
      min: 1,
      example: '36',
      width: 20,
    },
    {
      field: 'originalValue',
      label: 'Original Value (ETB)',
      type: 'number',
      min: 0,
      example: '145000',
      notes: 'Purchase value in ETB.',
      width: 20,
    },
    {
      field: 'managingDepartment',
      label: 'Managing Department',
      type: 'string',
      maxLength: 200,
      example: 'IT Department',
      width: 24,
    },
    {
      field: 'storageLocation',
      label: 'Storage Location',
      type: 'string',
      maxLength: 200,
      example: 'Head office store',
      width: 24,
    },
  ],
};

/**
 * Excel template / preview / commit for the company asset register.
 *
 * Assets have no approval workflow - imported rows land in the register with
 * status Available, the register's equivalent of a draft.
 */
@Injectable()
export class CompanyAssetImportService extends HrModuleImportServiceBase<CreateCompanyAssetDto> {
  constructor(
    excel: HrExcelImportService,
    private readonly prisma: PrismaService,
    private readonly companyAssetService: CompanyAssetService,
  ) {
    super(excel);
  }

  protected get schema(): ImportColumnSchema {
    return COMPANY_ASSET_IMPORT_SCHEMA;
  }

  protected async planRow(
    ctx: ImportActorContext,
    row: ValidatedImportRow,
  ): Promise<RowPlan<CreateCompanyAssetDto>> {
    const text = (field: string): string =>
      typeof row.values[field] === 'string' ? (row.values[field] as string) : '';
    const num = (field: string): number | undefined =>
      typeof row.values[field] === 'number'
        ? (row.values[field] as number)
        : undefined;

    const serialNumber = text('serialNumber').trim().toUpperCase();
    const label = text('assetName') || serialNumber;

    const existing = await this.prisma.companyAsset.findFirst({
      where: activeOnly({ companyId: ctx.companyId, serialNumber }),
      select: { id: true },
    });
    if (existing) {
      return {
        status: 'duplicate',
        label,
        message: `An asset with serial number ${serialNumber} already exists`,
      };
    }

    return {
      status: 'ok',
      label,
      dedupeKey: serialNumber,
      payload: {
        serialNumber,
        brand: text('brand'),
        model: text('model'),
        year: num('year') ?? 0,
        color: text('color'),
        type: text('type'),
        description: text('description') || undefined,
        assetCode: text('assetCode') || undefined,
        cardNumber: text('cardNumber') || undefined,
        assetName: text('assetName') || undefined,
        specifications: text('specifications') || undefined,
        assetCategory: text('assetCategory') || undefined,
        startUseDate: text('startUseDate') || undefined,
        usefulLifeMonths: num('usefulLifeMonths'),
        originalValue: num('originalValue'),
        managingDepartment: text('managingDepartment') || undefined,
        storageLocation: text('storageLocation') || undefined,
      },
    };
  }

  protected async commitRows(
    ctx: ImportActorContext,
    rows: Array<PlannedRow<CreateCompanyAssetDto>>,
  ): Promise<{ created: number; errors: ImportCommitResponseDto['errors'] }> {
    const errors: ImportCommitResponseDto['errors'] = [];
    let created = 0;

    for (const row of rows) {
      try {
        await this.companyAssetService.createAsset(
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
            error instanceof Error ? error.message : 'Failed to import asset',
        });
      }
    }

    return { created, errors };
  }
}
