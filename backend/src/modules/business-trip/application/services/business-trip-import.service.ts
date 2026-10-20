import { BadRequestException, Injectable } from '@nestjs/common';
import { FlightTripType, FlightVisaStatus } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { normalizeEmail } from '../../../../shared/utils/email.util';
import { ImportCommitResponseDto } from '../../../hr-shared/application/dtos/hr-import.dtos';
import { CreateBusinessTripDraftDto } from '../dtos/business-trip.dtos';
import {
  BusinessTripImportPreviewResponseDto,
  BusinessTripImportRowPreviewDto,
} from '../dtos/business-trip-import.dtos';
import { BusinessTripService } from './business-trip.service';

type AuditContext = { companyId: string; userId: string };

const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 500;
const TRIP_TYPE_VALUES = Object.values(FlightTripType);
const VISA_STATUS_VALUES = Object.values(FlightVisaStatus);

const ALLOWED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
]);

const HEADER_ALIASES: Record<string, keyof ParsedImportRow> = {
  submitteremail: 'submitterEmail',
  'submitter email': 'submitterEmail',
  submitter_email: 'submitterEmail',
  employeeemail: 'submitterEmail',
  'employee email': 'submitterEmail',
  employee_email: 'submitterEmail',
  email: 'submitterEmail',
  submitterid: 'submitterId',
  'submitter id': 'submitterId',
  submitter_id: 'submitterId',
  employeeid: 'submitterId',
  'employee id': 'submitterId',
  employee_id: 'submitterId',
  triptype: 'tripType',
  'trip type': 'tripType',
  trip_type: 'tripType',
  origincountry: 'originCountry',
  'origin country': 'originCountry',
  origin_country: 'originCountry',
  origincity: 'originCity',
  'origin city': 'originCity',
  origin_city: 'originCity',
  destinationcountry: 'destinationCountry',
  'destination country': 'destinationCountry',
  destination_country: 'destinationCountry',
  destinationcity: 'destinationCity',
  'destination city': 'destinationCity',
  destination_city: 'destinationCity',
  departuredate: 'departureDate',
  'departure date': 'departureDate',
  departure_date: 'departureDate',
  returndate: 'returnDate',
  'return date': 'returnDate',
  return_date: 'returnDate',
  purpose: 'purpose',
  hostorganization: 'hostOrganization',
  'host organization': 'hostOrganization',
  host_organization: 'hostOrganization',
  hostcontactname: 'hostContactName',
  'host contact name': 'hostContactName',
  host_contact_name: 'hostContactName',
  hostcontactphone: 'hostContactPhone',
  'host contact phone': 'hostContactPhone',
  host_contact_phone: 'hostContactPhone',
  hostcontactemail: 'hostContactEmail',
  'host contact email': 'hostContactEmail',
  host_contact_email: 'hostContactEmail',
  hostcontact: 'hostContactName',
  'host contact': 'hostContactName',
  host_contact: 'hostContactName',
  expectedoutcomes: 'expectedOutcomes',
  'expected outcomes': 'expectedOutcomes',
  expected_outcomes: 'expectedOutcomes',
  itinerary: 'itinerary',
  estimatedaccommodationcost: 'estimatedAccommodationCost',
  'estimated accommodation cost': 'estimatedAccommodationCost',
  estimated_accommodation_cost: 'estimatedAccommodationCost',
  estimatedperdiem: 'estimatedPerDiem',
  'estimated per diem': 'estimatedPerDiem',
  estimated_per_diem: 'estimatedPerDiem',
  estimatedothercost: 'estimatedOtherCost',
  'estimated other cost': 'estimatedOtherCost',
  estimated_other_cost: 'estimatedOtherCost',
  notes: 'notes',
  passengeremail: 'passengerEmail',
  'passenger email': 'passengerEmail',
  passenger_email: 'passengerEmail',
  passengerid: 'passengerId',
  'passenger id': 'passengerId',
  passenger_id: 'passengerId',
  passportnumber: 'passportNumber',
  'passport number': 'passportNumber',
  passport_number: 'passportNumber',
  passport: 'passportNumber',
  visarequired: 'visaRequired',
  'visa required': 'visaRequired',
  visa_required: 'visaRequired',
  visastatus: 'visaStatus',
  'visa status': 'visaStatus',
  visa_status: 'visaStatus',
};

interface ParsedImportRow {
  line: number;
  submitterEmail: string;
  submitterId: string;
  tripType: string;
  originCountry: string;
  originCity: string;
  destinationCountry: string;
  destinationCity: string;
  departureDate: string;
  returnDate: string;
  purpose: string;
  hostOrganization: string;
  hostContactName: string;
  hostContactPhone: string;
  hostContactEmail: string;
  expectedOutcomes: string;
  itinerary: string;
  estimatedAccommodationCost: string;
  estimatedPerDiem: string;
  estimatedOtherCost: string;
  notes: string;
  passengerEmail: string;
  passengerId: string;
  passportNumber: string;
  visaRequired: string;
  visaStatus: string;
}

const DATE_FIELDS = new Set<keyof ParsedImportRow>([
  'departureDate',
  'returnDate',
]);

/**
 * Excel template / preview / commit for business trip passengers.
 */
@Injectable()
export class BusinessTripImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessTripService: BusinessTripService,
  ) {}

  /**
   * Company-wide import template (trip header + passenger columns).
   */
  async buildCompanyTemplate(): Promise<Buffer> {
    const today = new Date().toISOString().slice(0, 10);
    return this.buildTemplate({
      sheetName: 'Business Trips',
      includeSubmitter: true,
      includeTripHeader: true,
      sample: {
        submitterEmail: 'employee@company.local',
        submitterId: '',
        tripType: 'ROUND_TRIP',
        originCountry: 'Ethiopia',
        originCity: 'Addis Ababa',
        destinationCountry: 'Kenya',
        destinationCity: 'Nairobi',
        departureDate: today,
        returnDate: today,
        purpose: 'Client meeting',
        hostOrganization: 'Partner Co',
        hostContactName: 'Partner Host',
        hostContactPhone: '+251 911 000 000',
        hostContactEmail: 'host@partner.local',
        expectedOutcomes: 'Signed MoU',
        itinerary: 'Day 1: meetings; Day 2: site visit',
        estimatedAccommodationCost: '200',
        estimatedPerDiem: '100',
        estimatedOtherCost: '',
        notes: '',
        passengerEmail: 'passenger@company.local',
        passengerId: '',
        passportNumber: '',
        visaRequired: 'TRUE',
        visaStatus: '',
      },
      note:
        'Each row adds a passenger to a DRAFT business trip for that submitter and trip (created if needed). Tickets/documents are not imported. Trips are not auto-submitted. Business trips are always international.',
    });
  }

  /**
   * Trip-scoped passenger import template.
   */
  async buildTripTemplate(): Promise<Buffer> {
    return this.buildTemplate({
      sheetName: 'Passengers',
      includeSubmitter: false,
      includeTripHeader: false,
      sample: {
        submitterEmail: '',
        submitterId: '',
        tripType: '',
        originCountry: '',
        originCity: '',
        destinationCountry: '',
        destinationCity: '',
        departureDate: '',
        returnDate: '',
        purpose: '',
        hostOrganization: '',
        hostContactName: '',
        hostContactPhone: '',
        hostContactEmail: '',
        expectedOutcomes: '',
        itinerary: '',
        estimatedAccommodationCost: '',
        estimatedPerDiem: '',
        estimatedOtherCost: '',
        notes: '',
        passengerEmail: 'passenger@company.local',
        passengerId: '',
        passportNumber: '',
        visaRequired: 'TRUE',
        visaStatus: '',
      },
      note:
        'Each valid row adds a passenger to this DRAFT business trip. Tickets must be attached in the UI after approval.',
    });
  }

  async previewCompanyImport(
    ctx: AuditContext,
    file: Express.Multer.File,
  ): Promise<BusinessTripImportPreviewResponseDto> {
    const rows = await this.parseWorkbook(file, {
      requireSubmitter: true,
      requireTripHeader: true,
    });
    return this.validateRows(ctx, rows, { mode: 'company' });
  }

  async commitCompanyImport(
    ctx: AuditContext,
    file: Express.Multer.File,
  ): Promise<ImportCommitResponseDto> {
    const rows = await this.parseWorkbook(file, {
      requireSubmitter: true,
      requireTripHeader: true,
    });
    const preview = await this.validateRows(ctx, rows, { mode: 'company' });
    return this.commitValidatedRows(ctx, preview, { mode: 'company' });
  }

  async previewTripImport(
    tripId: string,
    ctx: AuditContext,
    file: Express.Multer.File,
  ): Promise<BusinessTripImportPreviewResponseDto> {
    const trip = await this.requireImportableTrip(tripId, ctx);
    const rows = await this.parseWorkbook(file, {
      requireSubmitter: false,
      requireTripHeader: false,
    });
    return this.validateRows(ctx, rows, {
      mode: 'trip',
      tripId: trip.id,
      submitterId: trip.submittedBy,
    });
  }

  async commitTripImport(
    tripId: string,
    ctx: AuditContext,
    file: Express.Multer.File,
  ): Promise<ImportCommitResponseDto> {
    const trip = await this.requireImportableTrip(tripId, ctx);
    const rows = await this.parseWorkbook(file, {
      requireSubmitter: false,
      requireTripHeader: false,
    });
    const preview = await this.validateRows(ctx, rows, {
      mode: 'trip',
      tripId: trip.id,
      submitterId: trip.submittedBy,
    });
    return this.commitValidatedRows(ctx, preview, {
      mode: 'trip',
      tripId: trip.id,
    });
  }

  private async buildTemplate(input: {
    sheetName: string;
    includeSubmitter: boolean;
    includeTripHeader: boolean;
    sample: Omit<ParsedImportRow, 'line'>;
    note: string;
  }): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(input.sheetName);
    const columns: Array<{ header: string; key: string; width: number }> = [];

    if (input.includeSubmitter) {
      columns.push(
        { header: 'submitterEmail', key: 'submitterEmail', width: 28 },
        { header: 'submitterId', key: 'submitterId', width: 36 },
      );
    }
    if (input.includeTripHeader) {
      columns.push(
        { header: 'tripType', key: 'tripType', width: 12 },
        { header: 'originCountry', key: 'originCountry', width: 16 },
        { header: 'originCity', key: 'originCity', width: 16 },
        {
          header: 'destinationCountry',
          key: 'destinationCountry',
          width: 18,
        },
        { header: 'destinationCity', key: 'destinationCity', width: 16 },
        { header: 'departureDate', key: 'departureDate', width: 14 },
        { header: 'returnDate', key: 'returnDate', width: 14 },
        { header: 'purpose', key: 'purpose', width: 28 },
        { header: 'hostOrganization', key: 'hostOrganization', width: 20 },
        { header: 'hostContactName', key: 'hostContactName', width: 20 },
        { header: 'hostContactPhone', key: 'hostContactPhone', width: 18 },
        { header: 'hostContactEmail', key: 'hostContactEmail', width: 24 },
        { header: 'expectedOutcomes', key: 'expectedOutcomes', width: 24 },
        { header: 'itinerary', key: 'itinerary', width: 28 },
        {
          header: 'estimatedAccommodationCost',
          key: 'estimatedAccommodationCost',
          width: 22,
        },
        { header: 'estimatedPerDiem', key: 'estimatedPerDiem', width: 16 },
        {
          header: 'estimatedOtherCost',
          key: 'estimatedOtherCost',
          width: 16,
        },
        { header: 'notes', key: 'notes', width: 24 },
      );
    }
    columns.push(
      { header: 'passengerEmail', key: 'passengerEmail', width: 28 },
      { header: 'passengerId', key: 'passengerId', width: 36 },
      { header: 'passportNumber', key: 'passportNumber', width: 16 },
      { header: 'visaRequired', key: 'visaRequired', width: 12 },
      { header: 'visaStatus', key: 'visaStatus', width: 14 },
    );
    sheet.columns = columns;
    sheet.addRow(input.sample);

    const instructions = workbook.addWorksheet('Instructions');
    instructions.addRow(['Column', 'Required', 'Notes']);
    if (input.includeSubmitter) {
      instructions.addRow([
        'submitterEmail',
        'Preferred',
        'Trip owner email (preferred over submitterId)',
      ]);
      instructions.addRow([
        'submitterId',
        'If no email',
        'User UUID - required when submitterEmail is blank',
      ]);
    }
    if (input.includeTripHeader) {
      instructions.addRow([
        'tripType',
        'Yes',
        TRIP_TYPE_VALUES.join(' | '),
      ]);
      instructions.addRow(['originCountry', 'Yes', '']);
      instructions.addRow(['originCity', 'Yes', '']);
      instructions.addRow(['destinationCountry', 'Yes', '']);
      instructions.addRow(['destinationCity', 'Yes', '']);
      instructions.addRow(['departureDate', 'Yes', 'YYYY-MM-DD']);
      instructions.addRow([
        'returnDate',
        'If ROUND_TRIP',
        'YYYY-MM-DD - required for ROUND_TRIP',
      ]);
      instructions.addRow([
        'purpose',
        'Yes',
        'Rows with the same submitter + purpose + route + departureDate share one DRAFT trip',
      ]);
      instructions.addRow(['hostOrganization', 'No', '']);
      instructions.addRow(['hostContactName', 'No', '']);
      instructions.addRow(['hostContactPhone', 'No', '']);
      instructions.addRow(['hostContactEmail', 'No', '']);
      instructions.addRow(['expectedOutcomes', 'No', '']);
      instructions.addRow(['itinerary', 'No', '']);
      instructions.addRow([
        'estimatedAccommodationCost',
        'No',
        'Number ≥ 0',
      ]);
      instructions.addRow(['estimatedPerDiem', 'No', 'Number ≥ 0']);
      instructions.addRow(['estimatedOtherCost', 'No', 'Number ≥ 0']);
      instructions.addRow(['notes', 'No', '']);
    }
    instructions.addRow([
      'passengerEmail',
      'Preferred',
      'Passenger user email (preferred over passengerId)',
    ]);
    instructions.addRow([
      'passengerId',
      'If no email',
      'User UUID - required when passengerEmail is blank',
    ]);
    instructions.addRow([
      'passportNumber',
      'Recommended',
      'Optional string',
    ]);
    instructions.addRow([
      'visaRequired',
      'No',
      'TRUE | FALSE (default TRUE)',
    ]);
    instructions.addRow([
      'visaStatus',
      'No',
      VISA_STATUS_VALUES.join(' | '),
    ]);
    instructions.addRow([]);
    instructions.addRow(['Note', '', input.note]);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private async requireImportableTrip(
    tripId: string,
    ctx: AuditContext,
  ): Promise<{ id: string; submittedBy: string }> {
    const trip = await this.prisma.businessTrip.findFirst({
      where: activeOnly({ id: tripId, companyId: ctx.companyId }),
      select: { id: true, submittedBy: true, status: true },
    });
    if (!trip) {
      throw new BadRequestException('Business trip not found');
    }
    if (trip.status !== 'DRAFT') {
      throw new BadRequestException(
        'Passengers can only be imported into DRAFT business trips',
      );
    }
    await this.businessTripService.getTrip(tripId, ctx.companyId, ctx.userId);
    return trip;
  }

  private async commitValidatedRows(
    ctx: AuditContext,
    preview: BusinessTripImportPreviewResponseDto,
    options:
      | { mode: 'company' }
      | { mode: 'trip'; tripId: string },
  ): Promise<ImportCommitResponseDto> {
    const validRows = preview.rows.filter(
      (row): row is BusinessTripImportRowPreviewDto & {
        status: 'ok';
        submitterId: string;
        tripType: FlightTripType;
        originCountry: string;
        originCity: string;
        destinationCountry: string;
        destinationCity: string;
        departureDate: string;
        purpose: string;
        passengerId: string;
      } =>
        row.status === 'ok' &&
        Boolean(row.submitterId) &&
        Boolean(row.tripType) &&
        Boolean(row.originCountry) &&
        Boolean(row.originCity) &&
        Boolean(row.destinationCountry) &&
        Boolean(row.destinationCity) &&
        Boolean(row.departureDate) &&
        Boolean(row.purpose) &&
        Boolean(row.passengerId),
    );
    const skipped = preview.rows.length - validRows.length;
    const errors: ImportCommitResponseDto['errors'] = [];
    let created = 0;
    const tripCache = new Map<string, string>();

    for (const row of validRows) {
      try {
        let tripId: string;
        if (options.mode === 'trip') {
          tripId = options.tripId;
        } else {
          const cacheKey = this.tripKey(
            row.submitterId,
            row.tripType,
            row.originCity,
            row.destinationCountry,
            row.destinationCity,
            row.departureDate,
            row.purpose,
          );
          const cached = tripCache.get(cacheKey);
          if (cached) {
            tripId = cached;
          } else {
            const draftDto: CreateBusinessTripDraftDto = {
              tripType: row.tripType,
              originCountry: row.originCountry,
              originCity: row.originCity,
              destinationCountry: row.destinationCountry,
              destinationCity: row.destinationCity,
              departureDate: row.departureDate,
              returnDate: row.returnDate,
              purpose: row.purpose,
              hostOrganization: row.hostOrganization,
              hostContactName: row.hostContactName,
              hostContactPhone: row.hostContactPhone,
              hostContactEmail: row.hostContactEmail,
              expectedOutcomes: row.expectedOutcomes,
              itinerary: row.itinerary,
              estimatedAccommodationCost: row.estimatedAccommodationCost,
              estimatedPerDiem: row.estimatedPerDiem,
              estimatedOtherCost: row.estimatedOtherCost,
              notes: row.notes,
            };
            const trip = await this.businessTripService.findOrCreateDraftTrip(
              row.submitterId,
              draftDto,
              ctx.companyId,
              ctx.userId,
              false,
            );
            tripId = trip.id;
            tripCache.set(cacheKey, tripId);
          }
        }

        await this.businessTripService.addPassenger(
          tripId,
          {
            employeeId: row.passengerId,
            passportNumber: row.passportNumber,
            visaRequired: row.visaRequired,
            visaStatus: row.visaStatus ?? undefined,
          },
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
              : 'Failed to import business trip passenger',
        });
      }
    }

    return {
      created,
      skipped: skipped + errors.length,
      errors,
    };
  }

  private async parseWorkbook(
    file: Express.Multer.File,
    options: { requireSubmitter: boolean; requireTripHeader: boolean },
  ): Promise<ParsedImportRow[]> {
    this.assertValidUpload(file);
    const workbook = await this.loadWorkbookFromBuffer(file.buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new BadRequestException('Workbook must contain at least one sheet');
    }

    const headerRow = sheet.getRow(1);
    const columnMap = new Map<number, keyof ParsedImportRow>();
    headerRow.eachCell((cell, colNumber) => {
      const header = this.normalizeHeader(this.cellToString(cell.value));
      const field = HEADER_ALIASES[header];
      if (field) {
        columnMap.set(colNumber, field);
      }
    });

    const mapped = new Set(columnMap.values());
    if (!mapped.has('passengerEmail') && !mapped.has('passengerId')) {
      throw new BadRequestException(
        'Missing passengerEmail or passengerId column. Download the template.',
      );
    }
    if (options.requireSubmitter) {
      if (!mapped.has('submitterEmail') && !mapped.has('submitterId')) {
        throw new BadRequestException(
          'Missing submitterEmail or submitterId column. Download the template.',
        );
      }
    }
    if (options.requireTripHeader) {
      for (const field of [
        'tripType',
        'originCountry',
        'originCity',
        'destinationCountry',
        'destinationCity',
        'departureDate',
        'purpose',
      ] as const) {
        if (!mapped.has(field)) {
          throw new BadRequestException(
            `Missing required column: ${field}. Download the template.`,
          );
        }
      }
    }

    const rows: ParsedImportRow[] = [];
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const excelRow = sheet.getRow(rowNumber);
      if (this.isRowEmpty(excelRow)) {
        continue;
      }

      const parsed: ParsedImportRow = {
        line: rowNumber,
        submitterEmail: '',
        submitterId: '',
        tripType: '',
        originCountry: '',
        originCity: '',
        destinationCountry: '',
        destinationCity: '',
        departureDate: '',
        returnDate: '',
        purpose: '',
        hostOrganization: '',
        hostContactName: '',
        hostContactPhone: '',
        hostContactEmail: '',
        expectedOutcomes: '',
        itinerary: '',
        estimatedAccommodationCost: '',
        estimatedPerDiem: '',
        estimatedOtherCost: '',
        notes: '',
        passengerEmail: '',
        passengerId: '',
        passportNumber: '',
        visaRequired: '',
        visaStatus: '',
      };

      columnMap.forEach((field, colNumber) => {
        if (field === 'line') {
          return;
        }
        const cellValue = excelRow.getCell(colNumber).value;
        const value = DATE_FIELDS.has(field)
          ? this.cellToDateString(cellValue).trim()
          : this.cellToString(cellValue).trim();
        parsed[field] = value;
      });

      rows.push(parsed);
      if (rows.length > MAX_IMPORT_ROWS) {
        throw new BadRequestException(
          `Import exceeds maximum of ${MAX_IMPORT_ROWS} rows`,
        );
      }
    }

    if (rows.length === 0) {
      throw new BadRequestException('No data rows found in the spreadsheet');
    }
    return rows;
  }

  private async validateRows(
    ctx: AuditContext,
    rows: ParsedImportRow[],
    options:
      | { mode: 'company' }
      | {
          mode: 'trip';
          tripId: string;
          submitterId: string;
        },
  ): Promise<BusinessTripImportPreviewResponseDto> {
    const keysInFile = new Set<string>();
    const previewRows: BusinessTripImportRowPreviewDto[] = [];

    for (const row of rows) {
      const preview = await this.validateRow(ctx, row, keysInFile, options);
      previewRows.push(preview);
      if (preview.status === 'ok' && preview.submitterId && preview.passengerId) {
        keysInFile.add(
          this.passengerKey(preview.submitterId, preview.passengerId, {
            tripType: preview.tripType,
            originCity: preview.originCity,
            destinationCountry: preview.destinationCountry,
            destinationCity: preview.destinationCity,
            departureDate: preview.departureDate,
            purpose: preview.purpose,
            tripId: options.mode === 'trip' ? options.tripId : undefined,
          }),
        );
      }
    }

    const valid = previewRows.filter((r) => r.status === 'ok').length;
    const duplicate = previewRows.filter(
      (r) => r.status === 'duplicate' || r.status === 'duplicate_in_file',
    ).length;
    const invalid = previewRows.length - valid - duplicate;

    return { valid, invalid, duplicate, rows: previewRows };
  }

  private async validateRow(
    ctx: AuditContext,
    row: ParsedImportRow,
    keysInFile: Set<string>,
    options:
      | { mode: 'company' }
      | {
          mode: 'trip';
          tripId: string;
          submitterId: string;
        },
  ): Promise<BusinessTripImportRowPreviewDto> {
    const label =
      row.passengerEmail.trim() ||
      row.submitterEmail.trim() ||
      row.purpose.trim() ||
      `Line ${row.line}`;

    const base: BusinessTripImportRowPreviewDto = {
      line: row.line,
      label,
      status: 'error',
      submitterEmail: row.submitterEmail.trim() || undefined,
      submitterId: row.submitterId.trim() || undefined,
      passengerEmail: row.passengerEmail.trim() || undefined,
      passengerId: row.passengerId.trim() || undefined,
    };

    let submitterId: string;
    let tripType: FlightTripType;
    let originCountry: string;
    let originCity: string;
    let destinationCountry: string;
    let destinationCity: string;
    let departureDate: string;
    let returnDate: string | undefined;
    let purpose: string;
    let hostOrganization: string | undefined;
    let hostContactName: string | undefined;
    let hostContactPhone: string | undefined;
    let hostContactEmail: string | undefined;
    let expectedOutcomes: string | undefined;
    let itinerary: string | undefined;
    let estimatedAccommodationCost: number | undefined;
    let estimatedPerDiem: number | undefined;
    let estimatedOtherCost: number | undefined;
    let notes: string | undefined;

    if (options.mode === 'trip') {
      submitterId = options.submitterId;
      base.submitterId = submitterId;
      const trip = await this.prisma.businessTrip.findFirst({
        where: activeOnly({
          id: options.tripId,
          companyId: ctx.companyId,
        }),
        select: {
          tripType: true,
          originCountry: true,
          originCity: true,
          destinationCountry: true,
          destinationCity: true,
          departureDate: true,
          returnDate: true,
          purpose: true,
        },
      });
      if (!trip) {
        return {
          ...base,
          status: 'error',
          message: 'Business trip not found',
        };
      }
      tripType = trip.tripType;
      originCountry = trip.originCountry;
      originCity = trip.originCity;
      destinationCountry = trip.destinationCountry;
      destinationCity = trip.destinationCity;
      departureDate = trip.departureDate.toISOString().slice(0, 10);
      returnDate = trip.returnDate
        ? trip.returnDate.toISOString().slice(0, 10)
        : undefined;
      purpose = trip.purpose;
      base.label = row.passengerEmail.trim() || purpose || label;
      base.tripType = tripType;
      base.originCountry = originCountry;
      base.originCity = originCity;
      base.destinationCountry = destinationCountry;
      base.destinationCity = destinationCity;
      base.departureDate = departureDate;
      base.returnDate = returnDate;
      base.purpose = purpose;
    } else {
      const submitter = await this.resolveUser(
        ctx.companyId,
        row.submitterEmail,
        row.submitterId,
        'submitter',
      );
      if (!submitter.ok) {
        return { ...base, status: 'error', message: submitter.message };
      }
      submitterId = submitter.id;
      base.submitterId = submitter.id;
      base.submitterEmail = submitter.email ?? undefined;
      base.label =
        submitter.email ||
        `${submitter.firstName} ${submitter.lastName}`.trim() ||
        submitter.id;

      const tripTypeResult = this.parseEnum(
        row.tripType,
        TRIP_TYPE_VALUES,
        'tripType',
      );
      if (!tripTypeResult.ok) {
        return { ...base, status: 'error', message: tripTypeResult.message };
      }
      tripType = tripTypeResult.value;

      if (!row.originCountry.trim()) {
        return { ...base, status: 'error', message: 'originCountry is required' };
      }
      if (!row.originCity.trim()) {
        return { ...base, status: 'error', message: 'originCity is required' };
      }
      if (!row.destinationCountry.trim()) {
        return {
          ...base,
          status: 'error',
          message: 'destinationCountry is required',
        };
      }
      if (!row.destinationCity.trim()) {
        return {
          ...base,
          status: 'error',
          message: 'destinationCity is required',
        };
      }
      if (!row.purpose.trim()) {
        return { ...base, status: 'error', message: 'purpose is required' };
      }

      const departureResult = this.parseImportDate(
        row.departureDate,
        'departureDate',
        true,
      );
      if (!departureResult.ok || !departureResult.value) {
        return {
          ...base,
          status: 'error',
          message: departureResult.ok
            ? 'departureDate is required'
            : departureResult.message,
        };
      }
      departureDate = departureResult.value;

      const returnResult = this.parseImportDate(
        row.returnDate,
        'returnDate',
        tripType === FlightTripType.ROUND_TRIP,
      );
      if (!returnResult.ok) {
        return { ...base, status: 'error', message: returnResult.message };
      }
      returnDate = returnResult.value;

      const accomCost = this.parseOptionalNumber(
        row.estimatedAccommodationCost,
        'estimatedAccommodationCost',
      );
      if (!accomCost.ok) {
        return { ...base, status: 'error', message: accomCost.message };
      }
      estimatedAccommodationCost = accomCost.value;

      const perDiemCost = this.parseOptionalNumber(
        row.estimatedPerDiem,
        'estimatedPerDiem',
      );
      if (!perDiemCost.ok) {
        return { ...base, status: 'error', message: perDiemCost.message };
      }
      estimatedPerDiem = perDiemCost.value;

      const otherCost = this.parseOptionalNumber(
        row.estimatedOtherCost,
        'estimatedOtherCost',
      );
      if (!otherCost.ok) {
        return { ...base, status: 'error', message: otherCost.message };
      }
      estimatedOtherCost = otherCost.value;


      originCountry = row.originCountry.trim();
      originCity = row.originCity.trim();
      destinationCountry = row.destinationCountry.trim();
      destinationCity = row.destinationCity.trim();
      purpose = row.purpose.trim();
      hostOrganization = row.hostOrganization.trim() || undefined;
      hostContactName = row.hostContactName.trim() || undefined;
      hostContactPhone = row.hostContactPhone.trim() || undefined;
      hostContactEmail = row.hostContactEmail.trim() || undefined;
      expectedOutcomes = row.expectedOutcomes.trim() || undefined;
      itinerary = row.itinerary.trim() || undefined;
      notes = row.notes.trim() || undefined;

      base.tripType = tripType;
      base.originCountry = originCountry;
      base.originCity = originCity;
      base.destinationCountry = destinationCountry;
      base.destinationCity = destinationCity;
      base.departureDate = departureDate;
      base.returnDate = returnDate;
      base.purpose = purpose;
    }

    const passenger = await this.resolveUser(
      ctx.companyId,
      row.passengerEmail,
      row.passengerId,
      'passenger',
    );
    if (!passenger.ok) {
      return { ...base, status: 'error', message: passenger.message };
    }
    base.passengerId = passenger.id;
    base.passengerEmail = passenger.email ?? undefined;
    base.label =
      passenger.email ||
      `${passenger.firstName} ${passenger.lastName}`.trim() ||
      passenger.id;

    const visaRequiredResult = this.parseBoolean(row.visaRequired, false);
    if (!visaRequiredResult.ok) {
      return { ...base, status: 'error', message: visaRequiredResult.message };
    }
    const visaRequired = visaRequiredResult.value ?? true;

    let visaStatus: FlightVisaStatus | null = null;
    if (row.visaStatus.trim()) {
      const visaResult = this.parseEnum(
        row.visaStatus,
        VISA_STATUS_VALUES,
        'visaStatus',
      );
      if (!visaResult.ok) {
        return { ...base, status: 'error', message: visaResult.message };
      }
      visaStatus = visaResult.value;
    }

    const passportNumber = row.passportNumber.trim() || undefined;

    const key = this.passengerKey(submitterId, passenger.id, {
      tripType,
      originCity,
      destinationCountry,
      destinationCity,
      departureDate,
      purpose,
      tripId: options.mode === 'trip' ? options.tripId : undefined,
    });
    if (keysInFile.has(key)) {
      return {
        ...base,
        status: 'duplicate_in_file',
        message: 'Duplicate passenger for this trip in this file',
        passportNumber,
        visaRequired,
        visaStatus,
      };
    }

    if (options.mode === 'trip') {
      const existing = await this.prisma.businessTripPassenger.findFirst({
        where: {
          tripId: options.tripId,
          employeeId: passenger.id,
        },
        select: { id: true },
      });
      if (existing) {
        return {
          ...base,
          status: 'duplicate',
          message: 'Passenger already exists on this trip',
          passportNumber,
          visaRequired,
          visaStatus,
        };
      }
    }

    return {
      ...base,
      status: 'ok',
      submitterId,
      tripType,
      originCountry,
      originCity,
      destinationCountry,
      destinationCity,
      departureDate,
      returnDate,
      purpose,
      hostOrganization,
      hostContactName,
      hostContactPhone,
      hostContactEmail,
      expectedOutcomes,
      itinerary,
      estimatedAccommodationCost,
      estimatedPerDiem,
      estimatedOtherCost,
      notes,
      passengerId: passenger.id,
      passportNumber,
      visaRequired,
      visaStatus,
    };
  }

  private tripKey(
    submitterId: string,
    tripType: string,
    originCity: string,
    destinationCountry: string,
    destinationCity: string,
    departureDate: string,
    purpose: string,
  ): string {
    return [
      submitterId,
      tripType,
      originCity.trim().toLowerCase(),
      destinationCountry.trim().toLowerCase(),
      destinationCity.trim().toLowerCase(),
      departureDate,
      purpose.trim().toLowerCase(),
    ].join('|');
  }

  private passengerKey(
    submitterId: string,
    passengerId: string,
    trip: {
      tripType?: string;
      originCity?: string;
      destinationCountry?: string;
      destinationCity?: string;
      departureDate?: string;
      purpose?: string;
      tripId?: string;
    },
  ): string {
    if (trip.tripId) {
      return `${trip.tripId}|${passengerId}`;
    }
    return `${this.tripKey(
      submitterId,
      trip.tripType ?? '',
      trip.originCity ?? '',
      trip.destinationCountry ?? '',
      trip.destinationCity ?? '',
      trip.departureDate ?? '',
      trip.purpose ?? '',
    )}|${passengerId}`;
  }

  private async resolveUser(
    companyId: string,
    emailRaw: string,
    idRaw: string,
    role: 'submitter' | 'passenger',
  ): Promise<
    | {
        ok: true;
        id: string;
        email: string | null;
        firstName: string;
        lastName: string;
      }
    | { ok: false; message: string }
  > {
    const email = emailRaw.trim();
    const userId = idRaw.trim();
    const emailLabel = role === 'submitter' ? 'submitterEmail' : 'passengerEmail';
    const idLabel = role === 'submitter' ? 'submitterId' : 'passengerId';

    if (email) {
      if (!this.isValidEmail(email)) {
        return { ok: false, message: `Invalid ${emailLabel}` };
      }
      const user = await this.prisma.user.findFirst({
        where: activeOnly({
          companyId,
          email: normalizeEmail(email),
        }),
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      });
      if (!user) {
        return {
          ok: false,
          message: `${role === 'submitter' ? 'Submitter' : 'Passenger'} not found for email: ${email}`,
        };
      }
      return { ok: true, ...user };
    }

    if (!userId) {
      return {
        ok: false,
        message: `${emailLabel} or ${idLabel} is required`,
      };
    }
    if (!this.isUuid(userId)) {
      return { ok: false, message: `${idLabel} must be a valid UUID` };
    }

    const user = await this.prisma.user.findFirst({
      where: activeOnly({ companyId, id: userId }),
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });
    if (!user) {
      return {
        ok: false,
        message: `${role === 'submitter' ? 'Submitter' : 'Passenger'} not found for id: ${userId}`,
      };
    }
    return { ok: true, ...user };
  }

  private parseEnum<T extends string>(
    value: string,
    allowed: readonly T[],
    fieldLabel: string,
  ): { ok: true; value: T } | { ok: false; message: string } {
    if (!value.trim()) {
      return { ok: false, message: `${fieldLabel} is required` };
    }
    const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, '_');
    const match = allowed.find((entry) => entry === normalized);
    if (!match) {
      return {
        ok: false,
        message: `${fieldLabel} must be one of: ${allowed.join(', ')}`,
      };
    }
    return { ok: true, value: match };
  }

  private parseBoolean(
    value: string,
    required: boolean,
  ):
    | { ok: true; value: boolean | undefined }
    | { ok: false; message: string } {
    if (!value.trim()) {
      if (required) {
        return { ok: false, message: 'Boolean value is required' };
      }
      return { ok: true, value: undefined };
    }
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) {
      return { ok: true, value: true };
    }
    if (['false', '0', 'no', 'n'].includes(normalized)) {
      return { ok: true, value: false };
    }
    return { ok: false, message: 'Boolean must be TRUE or FALSE' };
  }

  private parseOptionalNumber(
    value: string,
    fieldLabel: string,
  ):
    | { ok: true; value: number | undefined }
    | { ok: false; message: string } {
    if (!value.trim()) {
      return { ok: true, value: undefined };
    }
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
      return {
        ok: false,
        message: `${fieldLabel} must be a number ≥ 0`,
      };
    }
    return { ok: true, value: num };
  }

  private parseImportDate(
    value: string,
    fieldLabel: string,
    required: boolean,
  ):
    | { ok: true; value: string | undefined }
    | { ok: false; message: string } {
    if (!value.trim()) {
      if (required) {
        return { ok: false, message: `${fieldLabel} is required` };
      }
      return { ok: true, value: undefined };
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (!match) {
      return { ok: false, message: `Invalid ${fieldLabel}: use YYYY-MM-DD` };
    }
    return { ok: true, value: `${match[1]}-${match[2]}-${match[3]}` };
  }

  private async loadWorkbookFromBuffer(
    buffer: Buffer,
  ): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    return workbook;
  }

  private assertValidUpload(file: Express.Multer.File): void {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      throw new BadRequestException('File exceeds maximum size of 5 MB');
    }
    if (file.mimetype && !ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Only .xlsx Excel files are supported');
    }
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }

  private normalizeHeader(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private cellToString(value: ExcelJS.CellValue): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'object' && 'text' in value) {
      return String(value.text ?? '');
    }
    if (typeof value === 'object' && 'result' in value) {
      return this.cellToString(value.result as ExcelJS.CellValue);
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    return String(value);
  }

  private cellToDateString(value: ExcelJS.CellValue): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (value instanceof Date) {
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const day = String(value.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    if (typeof value === 'object' && 'text' in value) {
      return this.cellToDateString(String(value.text ?? ''));
    }
    if (typeof value === 'object' && 'result' in value) {
      return this.cellToDateString(value.result as ExcelJS.CellValue);
    }
    const asString = String(value).trim();
    const isoMatch = /^(\d{4}-\d{2}-\d{2})/.exec(asString);
    if (isoMatch) {
      return isoMatch[1];
    }
    return asString;
  }

  private isRowEmpty(row: ExcelJS.Row): boolean {
    let hasValue = false;
    row.eachCell({ includeEmpty: false }, () => {
      hasValue = true;
    });
    return !hasValue;
  }
}
