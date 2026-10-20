import { BadRequestException, Injectable } from '@nestjs/common';
import {
  FlightTicketClass,
  FlightTripType,
  FlightVisaStatus,
} from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { normalizeEmail } from '../../../../shared/utils/email.util';
import { ImportCommitResponseDto } from '../../../hr-shared/application/dtos/hr-import.dtos';
import { CreateFlightDraftDto } from '../dtos/flight.dtos';
import {
  FlightImportPreviewResponseDto,
  FlightImportRowPreviewDto,
} from '../dtos/flight-import.dtos';
import { FlightService } from './flight.service';

type AuditContext = { companyId: string; userId: string };

const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 500;
const TRIP_TYPE_VALUES = Object.values(FlightTripType);
const TICKET_CLASS_VALUES = Object.values(FlightTicketClass);
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
  isinternational: 'isInternational',
  'is international': 'isInternational',
  is_international: 'isInternational',
  international: 'isInternational',
  origincountry: 'originCountry',
  'origin country': 'originCountry',
  origin_country: 'originCountry',
  origincity: 'originCity',
  'origin city': 'originCity',
  origin_city: 'originCity',
  destination: 'destination',
  departuredate: 'departureDate',
  'departure date': 'departureDate',
  departure_date: 'departureDate',
  returndate: 'returnDate',
  'return date': 'returnDate',
  return_date: 'returnDate',
  purpose: 'purpose',
  ticketclass: 'ticketClass',
  'ticket class': 'ticketClass',
  ticket_class: 'ticketClass',
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
  isInternational: string;
  originCountry: string;
  originCity: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  purpose: string;
  ticketClass: string;
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
 * Excel template / preview / commit for flight application passengers.
 */
@Injectable()
export class FlightImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flightService: FlightService,
  ) {}

  /**
   * Company-wide import template (application header + passenger columns).
   */
  async buildCompanyTemplate(): Promise<Buffer> {
    const today = new Date().toISOString().slice(0, 10);
    return this.buildTemplate({
      sheetName: 'Flight Applications',
      includeSubmitter: true,
      includeTripHeader: true,
      sample: {
        submitterEmail: 'employee@company.local',
        submitterId: '',
        tripType: 'ROUND_TRIP',
        isInternational: 'FALSE',
        originCountry: 'Ethiopia',
        originCity: 'Addis Ababa',
        destination: 'Hawassa',
        departureDate: today,
        returnDate: today,
        purpose: 'Site visit',
        ticketClass: 'ECONOMY',
        notes: '',
        passengerEmail: 'passenger@company.local',
        passengerId: '',
        passportNumber: '',
        visaRequired: 'FALSE',
        visaStatus: '',
      },
      note:
        'Each row adds a passenger to a DRAFT application for that submitter and trip (created if needed). Tickets/documents are not imported. Applications are not auto-submitted.',
    });
  }

  /**
   * Application-scoped passenger import template.
   */
  async buildApplicationTemplate(): Promise<Buffer> {
    return this.buildTemplate({
      sheetName: 'Passengers',
      includeSubmitter: false,
      includeTripHeader: false,
      sample: {
        submitterEmail: '',
        submitterId: '',
        tripType: '',
        isInternational: '',
        originCountry: '',
        originCity: '',
        destination: '',
        departureDate: '',
        returnDate: '',
        purpose: '',
        ticketClass: '',
        notes: '',
        passengerEmail: 'passenger@company.local',
        passengerId: '',
        passportNumber: '',
        visaRequired: 'FALSE',
        visaStatus: '',
      },
      note:
        'Each valid row adds a passenger to this DRAFT flight application. Tickets must be attached in the UI after approval.',
    });
  }

  async previewCompanyImport(
    ctx: AuditContext,
    file: Express.Multer.File,
  ): Promise<FlightImportPreviewResponseDto> {
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

  async previewApplicationImport(
    applicationId: string,
    ctx: AuditContext,
    file: Express.Multer.File,
  ): Promise<FlightImportPreviewResponseDto> {
    const app = await this.requireImportableApplication(applicationId, ctx);
    const rows = await this.parseWorkbook(file, {
      requireSubmitter: false,
      requireTripHeader: false,
    });
    return this.validateRows(ctx, rows, {
      mode: 'application',
      applicationId: app.id,
      submitterId: app.submittedBy,
    });
  }

  async commitApplicationImport(
    applicationId: string,
    ctx: AuditContext,
    file: Express.Multer.File,
  ): Promise<ImportCommitResponseDto> {
    const app = await this.requireImportableApplication(applicationId, ctx);
    const rows = await this.parseWorkbook(file, {
      requireSubmitter: false,
      requireTripHeader: false,
    });
    const preview = await this.validateRows(ctx, rows, {
      mode: 'application',
      applicationId: app.id,
      submitterId: app.submittedBy,
    });
    return this.commitValidatedRows(ctx, preview, {
      mode: 'application',
      applicationId: app.id,
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
        { header: 'isInternational', key: 'isInternational', width: 14 },
        { header: 'originCountry', key: 'originCountry', width: 16 },
        { header: 'originCity', key: 'originCity', width: 16 },
        { header: 'destination', key: 'destination', width: 16 },
        { header: 'departureDate', key: 'departureDate', width: 14 },
        { header: 'returnDate', key: 'returnDate', width: 14 },
        { header: 'purpose', key: 'purpose', width: 28 },
        { header: 'ticketClass', key: 'ticketClass', width: 12 },
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
        'Application owner email (preferred over submitterId)',
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
      instructions.addRow([
        'isInternational',
        'Yes',
        'TRUE | FALSE',
      ]);
      instructions.addRow(['originCountry', 'Yes', '']);
      instructions.addRow(['originCity', 'Yes', '']);
      instructions.addRow(['destination', 'Yes', '']);
      instructions.addRow(['departureDate', 'Yes', 'YYYY-MM-DD']);
      instructions.addRow([
        'returnDate',
        'If ROUND_TRIP',
        'YYYY-MM-DD - required for ROUND_TRIP',
      ]);
      instructions.addRow([
        'purpose',
        'Yes',
        'Rows with the same submitter + purpose + route + departureDate share one DRAFT application',
      ]);
      instructions.addRow([
        'ticketClass',
        'Yes',
        TICKET_CLASS_VALUES.join(' | '),
      ]);
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
      'Recommended for international',
      'Optional string',
    ]);
    instructions.addRow([
      'visaRequired',
      'No',
      'TRUE | FALSE (default FALSE)',
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

  private async requireImportableApplication(
    applicationId: string,
    ctx: AuditContext,
  ): Promise<{ id: string; submittedBy: string }> {
    const app = await this.prisma.flightApplication.findFirst({
      where: activeOnly({ id: applicationId, companyId: ctx.companyId }),
      select: { id: true, submittedBy: true, status: true },
    });
    if (!app) {
      throw new BadRequestException('Flight application not found');
    }
    if (app.status !== 'DRAFT') {
      throw new BadRequestException(
        'Passengers can only be imported into DRAFT flight applications',
      );
    }
    await this.flightService.getApplication(
      applicationId,
      ctx.companyId,
      ctx.userId,
    );
    return app;
  }

  private async commitValidatedRows(
    ctx: AuditContext,
    preview: FlightImportPreviewResponseDto,
    options:
      | { mode: 'company' }
      | { mode: 'application'; applicationId: string },
  ): Promise<ImportCommitResponseDto> {
    const validRows = preview.rows.filter(
      (row): row is FlightImportRowPreviewDto & {
        status: 'ok';
        submitterId: string;
        tripType: FlightTripType;
        isInternational: boolean;
        originCountry: string;
        originCity: string;
        destination: string;
        departureDate: string;
        purpose: string;
        ticketClass: FlightTicketClass;
        passengerId: string;
      } =>
        row.status === 'ok' &&
        Boolean(row.submitterId) &&
        Boolean(row.tripType) &&
        row.isInternational != null &&
        Boolean(row.originCountry) &&
        Boolean(row.originCity) &&
        Boolean(row.destination) &&
        Boolean(row.departureDate) &&
        Boolean(row.purpose) &&
        Boolean(row.ticketClass) &&
        Boolean(row.passengerId),
    );
    const skipped = preview.rows.length - validRows.length;
    const errors: ImportCommitResponseDto['errors'] = [];
    let created = 0;
    const appCache = new Map<string, string>();

    for (const row of validRows) {
      try {
        let applicationId: string;
        if (options.mode === 'application') {
          applicationId = options.applicationId;
        } else {
          const cacheKey = this.applicationKey(
            row.submitterId,
            row.tripType,
            row.originCity,
            row.destination,
            row.departureDate,
            row.purpose,
          );
          const cached = appCache.get(cacheKey);
          if (cached) {
            applicationId = cached;
          } else {
            const draftDto: CreateFlightDraftDto = {
              tripType: row.tripType,
              isInternational: row.isInternational,
              originCountry: row.originCountry,
              originCity: row.originCity,
              destination: row.destination,
              departureDate: row.departureDate,
              returnDate: row.returnDate,
              purpose: row.purpose,
              ticketClass: row.ticketClass,
              notes: row.notes,
            };
            const app = await this.flightService.findOrCreateDraftApplication(
              row.submitterId,
              draftDto,
              ctx.companyId,
              ctx.userId,
              false,
            );
            applicationId = app.id;
            appCache.set(cacheKey, applicationId);
          }
        }

        await this.flightService.addPassenger(
          applicationId,
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
              : 'Failed to import flight passenger',
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
        'isInternational',
        'originCountry',
        'originCity',
        'destination',
        'departureDate',
        'purpose',
        'ticketClass',
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
        isInternational: '',
        originCountry: '',
        originCity: '',
        destination: '',
        departureDate: '',
        returnDate: '',
        purpose: '',
        ticketClass: '',
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
          mode: 'application';
          applicationId: string;
          submitterId: string;
        },
  ): Promise<FlightImportPreviewResponseDto> {
    const keysInFile = new Set<string>();
    const previewRows: FlightImportRowPreviewDto[] = [];

    for (const row of rows) {
      const preview = await this.validateRow(ctx, row, keysInFile, options);
      previewRows.push(preview);
      if (preview.status === 'ok' && preview.submitterId && preview.passengerId) {
        keysInFile.add(
          this.passengerKey(preview.submitterId, preview.passengerId, {
            tripType: preview.tripType,
            originCity: preview.originCity,
            destination: preview.destination,
            departureDate: preview.departureDate,
            purpose: preview.purpose,
            applicationId:
              options.mode === 'application'
                ? options.applicationId
                : undefined,
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
          mode: 'application';
          applicationId: string;
          submitterId: string;
        },
  ): Promise<FlightImportRowPreviewDto> {
    const label =
      row.passengerEmail.trim() ||
      row.submitterEmail.trim() ||
      row.purpose.trim() ||
      `Line ${row.line}`;

    const base: FlightImportRowPreviewDto = {
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
    let isInternational: boolean;
    let originCountry: string;
    let originCity: string;
    let destination: string;
    let departureDate: string;
    let returnDate: string | undefined;
    let purpose: string;
    let ticketClass: FlightTicketClass;
    let notes: string | undefined;

    if (options.mode === 'application') {
      submitterId = options.submitterId;
      base.submitterId = submitterId;
      const app = await this.prisma.flightApplication.findFirst({
        where: activeOnly({
          id: options.applicationId,
          companyId: ctx.companyId,
        }),
        select: {
          tripType: true,
          isInternational: true,
          originCountry: true,
          originCity: true,
          destination: true,
          departureDate: true,
          returnDate: true,
          purpose: true,
          ticketClass: true,
        },
      });
      if (!app) {
        return {
          ...base,
          status: 'error',
          message: 'Flight application not found',
        };
      }
      tripType = app.tripType;
      isInternational = app.isInternational;
      originCountry = app.originCountry;
      originCity = app.originCity;
      destination = app.destination;
      departureDate = app.departureDate.toISOString().slice(0, 10);
      returnDate = app.returnDate
        ? app.returnDate.toISOString().slice(0, 10)
        : undefined;
      purpose = app.purpose;
      ticketClass = app.ticketClass;
      base.label = row.passengerEmail.trim() || purpose || label;
      base.tripType = tripType;
      base.isInternational = isInternational;
      base.originCountry = originCountry;
      base.originCity = originCity;
      base.destination = destination;
      base.departureDate = departureDate;
      base.returnDate = returnDate;
      base.purpose = purpose;
      base.ticketClass = ticketClass;
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

      const intlResult = this.parseBoolean(row.isInternational, true);
      if (!intlResult.ok || intlResult.value === undefined) {
        return {
          ...base,
          status: 'error',
          message: intlResult.ok
            ? 'isInternational is required'
            : intlResult.message,
        };
      }
      isInternational = intlResult.value;

      if (!row.originCountry.trim()) {
        return { ...base, status: 'error', message: 'originCountry is required' };
      }
      if (!row.originCity.trim()) {
        return { ...base, status: 'error', message: 'originCity is required' };
      }
      if (!row.destination.trim()) {
        return { ...base, status: 'error', message: 'destination is required' };
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

      const ticketResult = this.parseEnum(
        row.ticketClass,
        TICKET_CLASS_VALUES,
        'ticketClass',
      );
      if (!ticketResult.ok) {
        return { ...base, status: 'error', message: ticketResult.message };
      }
      ticketClass = ticketResult.value;

      originCountry = row.originCountry.trim();
      originCity = row.originCity.trim();
      destination = row.destination.trim();
      purpose = row.purpose.trim();
      notes = row.notes.trim() || undefined;

      base.tripType = tripType;
      base.isInternational = isInternational;
      base.originCountry = originCountry;
      base.originCity = originCity;
      base.destination = destination;
      base.departureDate = departureDate;
      base.returnDate = returnDate;
      base.purpose = purpose;
      base.ticketClass = ticketClass;
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
    const visaRequired = visaRequiredResult.value ?? false;

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
      destination,
      departureDate,
      purpose,
      applicationId:
        options.mode === 'application' ? options.applicationId : undefined,
    });
    if (keysInFile.has(key)) {
      return {
        ...base,
        status: 'duplicate_in_file',
        message: 'Duplicate passenger for this application in this file',
        passportNumber,
        visaRequired,
        visaStatus,
      };
    }

    if (options.mode === 'application') {
      const existing = await this.prisma.flightPassenger.findFirst({
        where: {
          applicationId: options.applicationId,
          employeeId: passenger.id,
        },
        select: { id: true },
      });
      if (existing) {
        return {
          ...base,
          status: 'duplicate',
          message: 'Passenger already exists on this application',
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
      isInternational,
      originCountry,
      originCity,
      destination,
      departureDate,
      returnDate,
      purpose,
      ticketClass,
      notes,
      passengerId: passenger.id,
      passportNumber,
      visaRequired,
      visaStatus,
    };
  }

  private applicationKey(
    submitterId: string,
    tripType: string,
    originCity: string,
    destination: string,
    departureDate: string,
    purpose: string,
  ): string {
    return [
      submitterId,
      tripType,
      originCity.trim().toLowerCase(),
      destination.trim().toLowerCase(),
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
      destination?: string;
      departureDate?: string;
      purpose?: string;
      applicationId?: string;
    },
  ): string {
    if (trip.applicationId) {
      return `${trip.applicationId}|${passengerId}`;
    }
    return `${this.applicationKey(
      submitterId,
      trip.tripType ?? '',
      trip.originCity ?? '',
      trip.destination ?? '',
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
