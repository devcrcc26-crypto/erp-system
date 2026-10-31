import { BadRequestException, Injectable } from '@nestjs/common';
import { Nationality } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { normalizeEmail } from '../../../../shared/utils/email.util';
import { ImportCommitResponseDto } from '../../../hr-shared/application/dtos/hr-import.dtos';
import { WorkScheduleService } from '../../../work-schedule/application/services/work-schedule.service';
import { parseDateOnly } from '../../../work-schedule/application/services/work-schedule.dates';
import { UpsertOvertimeEntryDto } from '../dtos/overtime.dtos';
import {
  OvertimeImportPreviewResponseDto,
  OvertimeImportRowPreviewDto,
} from '../dtos/overtime-import.dtos';
import {
  WITHIN_SCHEDULE_MESSAGE,
} from '../utils/overtime-hours.util';
import {
  entryToSameDayOccupiedWindow,
  parseHhMmToMinutesStrict,
  timeIntervalsOverlap,
} from '../utils/overtime-selectable-windows.util';
import { OvertimeEntryService } from './overtime-entry.service';
import { OvertimeService } from './overtime.service';

type AuditContext = { companyId: string; userId: string };

const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 500;

const ALLOWED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
]);

const HEADER_ALIASES: Record<string, keyof ParsedImportRow> = {
  employeeemail: 'employeeEmail',
  'employee email': 'employeeEmail',
  employee_email: 'employeeEmail',
  email: 'employeeEmail',
  employeeid: 'employeeId',
  'employee id': 'employeeId',
  employee_id: 'employeeId',
  year: 'year',
  month: 'month',
  date: 'date',
  starttime: 'startTime',
  'start time': 'startTime',
  start_time: 'startTime',
  endtime: 'endTime',
  'end time': 'endTime',
  end_time: 'endTime',
  isholiday: 'isHoliday',
  'is holiday': 'isHoliday',
  is_holiday: 'isHoliday',
  holiday: 'isHoliday',
  taskdescription: 'taskDescription',
  'task description': 'taskDescription',
  task_description: 'taskDescription',
  task: 'taskDescription',
  description: 'taskDescription',
};

interface ParsedImportRow {
  line: number;
  employeeEmail: string;
  employeeId: string;
  year: string;
  month: string;
  date: string;
  startTime: string;
  endTime: string;
  isHoliday: string;
  taskDescription: string;
}

const DATE_FIELDS = new Set<keyof ParsedImportRow>(['date']);

/**
 * Excel template / preview / commit for overtime sheet entries.
 */
@Injectable()
export class OvertimeImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly overtimeService: OvertimeService,
    private readonly overtimeEntryService: OvertimeEntryService,
    private readonly workScheduleService: WorkScheduleService,
  ) {}

  /**
   * Builds a company-wide overtime entries import template.
   */
  async buildCompanyTemplate(): Promise<Buffer> {
    return this.buildTemplate({
      sheetName: 'Overtime Entries',
      includeEmployee: true,
      includePeriod: true,
      sample: {
        employeeEmail: 'employee@company.local',
        employeeId: '',
        year: String(new Date().getUTCFullYear()),
        month: String(new Date().getUTCMonth() + 1),
        date: new Date().toISOString().slice(0, 10),
        startTime: '18:00',
        endTime: '21:00',
        isHoliday: 'false',
        taskDescription: 'Site supervision overtime',
      },
      note:
        'Each valid row adds an entry to the employee DRAFT/RETURNED sheet for that month (sheet is created if needed). Sheets are not auto-submitted.',
    });
  }

  /**
   * Builds a sheet-scoped entries import template (no employee/period columns).
   */
  async buildSheetTemplate(): Promise<Buffer> {
    return this.buildTemplate({
      sheetName: 'Sheet Entries',
      includeEmployee: false,
      includePeriod: false,
      sample: {
        employeeEmail: '',
        employeeId: '',
        year: '',
        month: '',
        date: new Date().toISOString().slice(0, 10),
        startTime: '18:00',
        endTime: '21:00',
        isHoliday: 'false',
        taskDescription: 'Site supervision overtime',
      },
      note:
        'Each valid row adds an entry to this overtime sheet. Dates must fall in the sheet month/year. Sheet must be DRAFT or RETURNED.',
    });
  }

  /**
   * Validates a company-wide overtime entries upload without writing.
   */
  async previewCompanyImport(
    ctx: AuditContext,
    file: Express.Multer.File,
  ): Promise<OvertimeImportPreviewResponseDto> {
    const rows = await this.parseWorkbook(file, {
      requireEmployee: true,
      requirePeriod: true,
    });
    return this.validateRows(ctx, rows, { mode: 'company' });
  }

  /**
   * Commits company-wide overtime entry import into employee sheets.
   */
  async commitCompanyImport(
    ctx: AuditContext,
    file: Express.Multer.File,
  ): Promise<ImportCommitResponseDto> {
    const rows = await this.parseWorkbook(file, {
      requireEmployee: true,
      requirePeriod: true,
    });
    const preview = await this.validateRows(ctx, rows, { mode: 'company' });
    return this.commitValidatedRows(ctx, preview, { mode: 'company' });
  }

  /**
   * Validates sheet-scoped entry import without writing.
   */
  async previewSheetImport(
    sheetId: string,
    ctx: AuditContext,
    file: Express.Multer.File,
  ): Promise<OvertimeImportPreviewResponseDto> {
    const sheet = await this.requireImportableSheet(sheetId, ctx);
    const rows = await this.parseWorkbook(file, {
      requireEmployee: false,
      requirePeriod: false,
    });
    return this.validateRows(ctx, rows, {
      mode: 'sheet',
      sheetId: sheet.id,
      employeeId: sheet.employeeId,
      year: sheet.year,
      month: sheet.month,
    });
  }

  /**
   * Commits sheet-scoped overtime entry import.
   */
  async commitSheetImport(
    sheetId: string,
    ctx: AuditContext,
    file: Express.Multer.File,
  ): Promise<ImportCommitResponseDto> {
    const sheet = await this.requireImportableSheet(sheetId, ctx);
    const rows = await this.parseWorkbook(file, {
      requireEmployee: false,
      requirePeriod: false,
    });
    const preview = await this.validateRows(ctx, rows, {
      mode: 'sheet',
      sheetId: sheet.id,
      employeeId: sheet.employeeId,
      year: sheet.year,
      month: sheet.month,
    });
    return this.commitValidatedRows(ctx, preview, {
      mode: 'sheet',
      sheetId: sheet.id,
    });
  }

  private async buildTemplate(input: {
    sheetName: string;
    includeEmployee: boolean;
    includePeriod: boolean;
    sample: Omit<ParsedImportRow, 'line'>;
    note: string;
  }): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(input.sheetName);

    const columns: Array<{ header: string; key: string; width: number }> = [];
    if (input.includeEmployee) {
      columns.push(
        { header: 'employeeEmail', key: 'employeeEmail', width: 28 },
        { header: 'employeeId', key: 'employeeId', width: 36 },
      );
    }
    if (input.includePeriod) {
      columns.push(
        { header: 'year', key: 'year', width: 10 },
        { header: 'month', key: 'month', width: 10 },
      );
    }
    columns.push(
      { header: 'date', key: 'date', width: 12 },
      { header: 'startTime', key: 'startTime', width: 12 },
      { header: 'endTime', key: 'endTime', width: 12 },
      { header: 'isHoliday', key: 'isHoliday', width: 12 },
      { header: 'taskDescription', key: 'taskDescription', width: 36 },
    );
    sheet.columns = columns;
    sheet.addRow(input.sample);

    const instructions = workbook.addWorksheet('Instructions');
    instructions.addRow(['Column', 'Required', 'Notes']);
    if (input.includeEmployee) {
      instructions.addRow([
        'employeeEmail',
        'Preferred',
        'Resolve employee by email (preferred over employeeId)',
      ]);
      instructions.addRow([
        'employeeId',
        'If no email',
        'User UUID - required when employeeEmail is blank',
      ]);
    }
    if (input.includePeriod) {
      instructions.addRow(['year', 'Yes', 'Sheet year (e.g. 2026)']);
      instructions.addRow(['month', 'Yes', 'Sheet month 1-12']);
    }
    instructions.addRow(['date', 'Yes', 'YYYY-MM-DD (must match sheet month/year)']);
    instructions.addRow(['startTime', 'Yes', 'HH:mm 24-hour']);
    instructions.addRow(['endTime', 'Yes', 'HH:mm 24-hour']);
    instructions.addRow([
      'isHoliday',
      'No',
      'Optional override. true/false, yes/no, 1/0. If omitted, public holidays are applied automatically. If true and the date is not a registered public holiday for the employee, the row is imported as holiday hours with a warning.',
    ]);
    instructions.addRow(['taskDescription', 'Yes', 'Work description']);
    instructions.addRow([]);
    instructions.addRow(['Note', '', input.note]);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private async requireImportableSheet(
    sheetId: string,
    ctx: AuditContext,
  ): Promise<{
    id: string;
    employeeId: string;
    year: number;
    month: number;
  }> {
    const sheet = await this.prisma.overtimeSheet.findFirst({
      where: activeOnly({ id: sheetId, companyId: ctx.companyId }),
      select: {
        id: true,
        employeeId: true,
        year: true,
        month: true,
        status: true,
      },
    });
    if (!sheet) {
      throw new BadRequestException('Overtime sheet not found');
    }
    if (sheet.status !== 'DRAFT' && sheet.status !== 'RETURNED') {
      throw new BadRequestException(
        'Entries can only be imported into DRAFT or RETURNED sheets',
      );
    }
    // Access check via getSheet (throws if forbidden)
    await this.overtimeService.getSheet(sheetId, ctx.companyId, ctx.userId);
    return sheet;
  }

  private async commitValidatedRows(
    ctx: AuditContext,
    preview: OvertimeImportPreviewResponseDto,
    options:
      | { mode: 'company' }
      | { mode: 'sheet'; sheetId: string },
  ): Promise<ImportCommitResponseDto> {
    const validRows = preview.rows.filter(
      (row): row is OvertimeImportRowPreviewDto & {
        status: 'ok' | 'warning';
        employeeId: string;
        year: number;
        month: number;
        date: string;
        startTime: string;
        endTime: string;
        taskDescription: string;
      } =>
        (row.status === 'ok' || row.status === 'warning') &&
        Boolean(row.employeeId) &&
        row.year != null &&
        row.month != null &&
        Boolean(row.date) &&
        Boolean(row.startTime) &&
        Boolean(row.endTime) &&
        Boolean(row.taskDescription),
    );
    const skipped = preview.rows.length - validRows.length;
    const errors: ImportCommitResponseDto['errors'] = [];
    let created = 0;

    for (const row of validRows) {
      try {
        let sheetId: string;
        if (options.mode === 'sheet') {
          sheetId = options.sheetId;
        } else {
          const sheet = (await this.overtimeService.getOrCreateSheet(
            row.employeeId,
            row.month,
            row.year,
            ctx.companyId,
            ctx.userId,
          )) as { id: string };
          sheetId = sheet.id;
        }

        const isOvernight =
          row.endTime !== '24:00' &&
          parseHhMmToMinutesStrict(row.endTime) <=
            parseHhMmToMinutesStrict(row.startTime);
        const dto: UpsertOvertimeEntryDto = {
          date: row.date,
          startTime: row.startTime,
          endTime: row.endTime,
          isHoliday: row.isHoliday ?? false,
          isOvernight,
          taskDescription: row.taskDescription,
        };
        await this.overtimeService.addEntry(
          sheetId,
          dto,
          ctx.companyId,
          ctx.userId,
          {
            allowHolidayOverride: Boolean(dto.isHoliday),
            allowOvernight: isOvernight,
          },
        );
        created += 1;
      } catch (error) {
        errors.push({
          line: row.line,
          label: row.label,
          message:
            error instanceof Error
              ? error.message
              : 'Failed to import overtime entry',
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
    options: { requireEmployee: boolean; requirePeriod: boolean },
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
    for (const field of [
      'date',
      'startTime',
      'endTime',
      'taskDescription',
    ] as const) {
      if (!mapped.has(field)) {
        throw new BadRequestException(
          `Missing required column: ${field}. Download the template.`,
        );
      }
    }
    if (options.requireEmployee) {
      if (!mapped.has('employeeEmail') && !mapped.has('employeeId')) {
        throw new BadRequestException(
          'Missing employeeEmail or employeeId column. Download the template.',
        );
      }
    }
    if (options.requirePeriod) {
      for (const field of ['year', 'month'] as const) {
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
        employeeEmail: '',
        employeeId: '',
        year: '',
        month: '',
        date: '',
        startTime: '',
        endTime: '',
        isHoliday: '',
        taskDescription: '',
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
          mode: 'sheet';
          sheetId: string;
          employeeId: string;
          year: number;
          month: number;
        },
  ): Promise<OvertimeImportPreviewResponseDto> {
    const keysInFile = new Set<string>();
    const previewRows: OvertimeImportRowPreviewDto[] = [];

    for (const row of rows) {
      const preview = await this.validateRow(ctx, row, keysInFile, options);
      previewRows.push(preview);
      if (
        (preview.status === 'ok' || preview.status === 'warning') &&
        preview.employeeId &&
        preview.date &&
        preview.startTime &&
        preview.endTime
      ) {
        keysInFile.add(
          this.rowKey(
            preview.employeeId,
            preview.year ?? 0,
            preview.month ?? 0,
            preview.date,
            preview.startTime,
            preview.endTime,
          ),
        );
      }
    }

    const valid = previewRows.filter(
      (r) => r.status === 'ok' || r.status === 'warning',
    ).length;
    const warnings = previewRows.filter((r) => r.status === 'warning').length;
    const duplicate = previewRows.filter(
      (r) => r.status === 'duplicate' || r.status === 'duplicate_in_file',
    ).length;
    const invalid = previewRows.length - valid - duplicate;

    return { valid, invalid, duplicate, warnings, rows: previewRows };
  }

  private async validateRow(
    ctx: AuditContext,
    row: ParsedImportRow,
    keysInFile: Set<string>,
    options:
      | { mode: 'company' }
      | {
          mode: 'sheet';
          sheetId: string;
          employeeId: string;
          year: number;
          month: number;
        },
  ): Promise<OvertimeImportRowPreviewDto> {
    const label =
      row.employeeEmail.trim() ||
      row.employeeId.trim() ||
      row.date.trim() ||
      `Line ${row.line}`;

    const base: OvertimeImportRowPreviewDto = {
      line: row.line,
      label,
      status: 'error',
      employeeEmail: row.employeeEmail.trim() || undefined,
      employeeId: row.employeeId.trim() || undefined,
      taskDescription: row.taskDescription.trim() || undefined,
    };

    let employeeId: string;
    let year: number;
    let month: number;

    if (options.mode === 'sheet') {
      employeeId = options.employeeId;
      year = options.year;
      month = options.month;
      base.employeeId = employeeId;
      base.year = year;
      base.month = month;
      base.label = row.date.trim() || label;
    } else {
      const employee = await this.resolveEmployee(ctx.companyId, row);
      if (!employee.ok) {
        return { ...base, status: 'error', message: employee.message };
      }
      employeeId = employee.id;
      base.label =
        employee.email ||
        `${employee.firstName} ${employee.lastName}`.trim() ||
        employee.id;
      base.employeeId = employee.id;
      base.employeeEmail = employee.email ?? undefined;

      const yearResult = this.parseYear(row.year);
      if (!yearResult.ok) {
        return { ...base, status: 'error', message: yearResult.message };
      }
      const monthResult = this.parseMonth(row.month);
      if (!monthResult.ok) {
        return { ...base, status: 'error', message: monthResult.message };
      }
      year = yearResult.value;
      month = monthResult.value;
      base.year = year;
      base.month = month;
    }

    const dateResult = this.parseImportDate(row.date, 'date', true);
    if (!dateResult.ok || !dateResult.value) {
      return {
        ...base,
        status: 'error',
        message: dateResult.ok ? 'date is required' : dateResult.message,
      };
    }

    const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateResult.value);
    if (!dateParts) {
      return { ...base, status: 'error', message: 'Invalid date: use YYYY-MM-DD' };
    }
    const dateYear = Number(dateParts[1]);
    const dateMonth = Number(dateParts[2]);
    if (dateYear !== year || dateMonth !== month) {
      return {
        ...base,
        status: 'error',
        message: `date must fall in sheet period ${year}-${String(month).padStart(2, '0')}`,
      };
    }

    const startTimeResult = this.parseTime(row.startTime, 'startTime');
    if (!startTimeResult.ok) {
      return { ...base, status: 'error', message: startTimeResult.message };
    }
    const endTimeResult = this.parseTime(row.endTime, 'endTime', {
      allowEndOfDay: true,
    });
    if (!endTimeResult.ok) {
      return { ...base, status: 'error', message: endTimeResult.message };
    }

    if (!row.taskDescription.trim()) {
      return {
        ...base,
        status: 'error',
        message: 'taskDescription is required',
      };
    }

    const isHoliday = this.parseBoolean(row.isHoliday);
    const startTime = startTimeResult.value;
    const endTime = endTimeResult.value;
    const isOvernight =
      endTime !== '24:00' &&
      parseHhMmToMinutesStrict(endTime) <= parseHhMmToMinutesStrict(startTime);

    if (endTime === startTime) {
      return {
        ...base,
        status: 'error',
        message: 'Start and end time cannot be the same',
        date: dateResult.value,
        startTime,
        endTime,
        isHoliday,
        taskDescription: row.taskDescription.trim(),
      };
    }

    // Same rules as addEntry — surface schedule / window errors on upload preview.
    try {
      const classified = await this.overtimeEntryService.classifyEntry(
        employeeId,
        ctx.companyId,
        parseDateOnly(dateResult.value),
        startTime,
        endTime,
        {
          holidayOverride: isHoliday,
          isOvernight,
          enforceSelectableWindows: !isOvernight,
        },
      );
      if (classified.totalHours <= 0) {
        return {
          ...base,
          status: 'error',
          message:
            classified.scheduleNote ?? WITHIN_SCHEDULE_MESSAGE,
          date: dateResult.value,
          startTime,
          endTime,
          isHoliday,
          taskDescription: row.taskDescription.trim(),
        };
      }
    } catch (error: unknown) {
      return {
        ...base,
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Invalid overtime times for this employee and date',
        date: dateResult.value,
        startTime,
        endTime,
        isHoliday,
        taskDescription: row.taskDescription.trim(),
      };
    }

    const key = this.rowKey(
      employeeId,
      year,
      month,
      dateResult.value,
      startTime,
      endTime,
    );
    if (keysInFile.has(key)) {
      return {
        ...base,
        status: 'duplicate_in_file',
        message: 'Duplicate overtime entry in this file',
        date: dateResult.value,
        startTime,
        endTime,
        isHoliday,
        taskDescription: row.taskDescription.trim(),
      };
    }

    if (options.mode === 'sheet') {
      const entryDate = new Date(
        Date.UTC(dateYear, dateMonth - 1, Number(dateParts[3])),
      );
      const candidate = entryToSameDayOccupiedWindow({
        startHhMm: startTime,
        endHhMm: endTime,
      });
      if (candidate) {
        const existing = await this.prisma.overtimeEntry.findMany({
          where: {
            sheetId: options.sheetId,
            date: entryDate,
          },
          select: {
            startTime: true,
            endTime: true,
            endsAtEndOfDay: true,
            isOvernight: true,
          },
        });
        const newStart = parseHhMmToMinutesStrict(candidate.start);
        const newEnd = parseHhMmToMinutesStrict(candidate.end);
        const overlaps = existing.some((entry) => {
          const occupied = entryToSameDayOccupiedWindow({
            startHhMm: this.formatStoredTime(entry.startTime),
            endHhMm: entry.endsAtEndOfDay
              ? '24:00'
              : this.formatStoredTime(entry.endTime),
            endsAtEndOfDay: entry.endsAtEndOfDay,
            isOvernight: entry.isOvernight,
          });
          if (!occupied) {
            return false;
          }
          return timeIntervalsOverlap(
            newStart,
            newEnd,
            parseHhMmToMinutesStrict(occupied.start),
            parseHhMmToMinutesStrict(occupied.end),
          );
        });
        if (overlaps) {
          return {
            ...base,
            status: 'duplicate',
            message:
              'An overlapping overtime entry already exists on this sheet for that date and time',
            date: dateResult.value,
            startTime,
            endTime,
            isHoliday,
            taskDescription: row.taskDescription.trim(),
          };
        }
      }
    }

    const employeeMeta = await this.loadEmployeeMeta(ctx.companyId, employeeId);
    let status: 'ok' | 'warning' = 'ok';
    let message: string | undefined;
    if (isHoliday) {
      const calendar = await this.workScheduleService.isHolidayForEmployee(
        ctx.companyId,
        employeeMeta.nationality,
        parseDateOnly(dateResult.value),
      );
      if (!calendar.isHoliday) {
        status = 'warning';
        message = this.unregisteredHolidayWarning(
          row.line,
          employeeMeta.name,
          dateResult.value,
          employeeMeta.nationality,
        );
      }
    }

    return {
      ...base,
      status,
      message,
      date: dateResult.value,
      startTime,
      endTime,
      isHoliday,
      taskDescription: row.taskDescription.trim(),
    };
  }

  private rowKey(
    employeeId: string,
    year: number,
    month: number,
    date: string,
    startTime: string,
    endTime: string,
  ): string {
    return `${employeeId}|${year}|${month}|${date}|${startTime}|${endTime}`;
  }

  private async resolveEmployee(
    companyId: string,
    row: ParsedImportRow,
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
    const email = row.employeeEmail.trim();
    const employeeId = row.employeeId.trim();

    if (email) {
      if (!this.isValidEmail(email)) {
        return { ok: false, message: 'Invalid employeeEmail' };
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
          nationality: true,
        },
      });
      if (!user) {
        return { ok: false, message: `Employee not found for email: ${email}` };
      }
      return { ok: true, ...user };
    }

    if (!employeeId) {
      return {
        ok: false,
        message: 'employeeEmail or employeeId is required',
      };
    }
    if (!this.isUuid(employeeId)) {
      return { ok: false, message: 'employeeId must be a valid UUID' };
    }

    const user = await this.prisma.user.findFirst({
      where: activeOnly({ companyId, id: employeeId }),
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        nationality: true,
      },
    });
    if (!user) {
      return { ok: false, message: `Employee not found for id: ${employeeId}` };
    }
    return { ok: true, ...user };
  }

  private async loadEmployeeMeta(
    companyId: string,
    employeeId: string,
  ): Promise<{ name: string; nationality: Nationality | null }> {
    const user = await this.prisma.user.findFirst({
      where: activeOnly({ id: employeeId, companyId }),
      select: { firstName: true, lastName: true, nationality: true },
    });
    const name = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || employeeId;
    return { name, nationality: user?.nationality ?? null };
  }

  private unregisteredHolidayWarning(
    line: number,
    employeeName: string,
    date: string,
    nationality: Nationality | null,
  ): string {
    const nationalityLabel =
      nationality === Nationality.ETHIOPIAN
        ? 'Ethiopian'
        : nationality === Nationality.CHINESE
          ? 'Chinese'
          : 'all';
    return (
      `Row ${line} - ${employeeName}, ${date}: isHoliday is marked but ${date} is not a ` +
      `registered public holiday for ${nationalityLabel} employees. Hours have been ` +
      `classified as holiday. Please verify before submitting.`
    );
  }

  private parseYear(
    value: string,
  ): { ok: true; value: number } | { ok: false; message: string } {
    if (!value.trim()) {
      return { ok: false, message: 'year is required' };
    }
    const num = Number(value);
    if (!Number.isInteger(num) || num < 2000 || num > 2100) {
      return { ok: false, message: 'year must be between 2000 and 2100' };
    }
    return { ok: true, value: num };
  }

  private parseMonth(
    value: string,
  ): { ok: true; value: number } | { ok: false; message: string } {
    if (!value.trim()) {
      return { ok: false, message: 'month is required' };
    }
    const num = Number(value);
    if (!Number.isInteger(num) || num < 1 || num > 12) {
      return { ok: false, message: 'month must be between 1 and 12' };
    }
    return { ok: true, value: num };
  }

  private parseTime(
    value: string,
    fieldLabel: string,
    options?: { allowEndOfDay?: boolean },
  ): { ok: true; value: string } | { ok: false; message: string } {
    if (!value.trim()) {
      return { ok: false, message: `${fieldLabel} is required` };
    }
    let normalized = value.trim();
    // Excel may emit Date objects already stringified as ISO; also accept H:mm
    const isoTime = /T(\d{2}):(\d{2})/.exec(normalized);
    if (isoTime) {
      normalized = `${isoTime[1]}:${isoTime[2]}`;
    }
    const short = /^(\d{1,2}):(\d{2})$/.exec(normalized);
    if (!short) {
      return {
        ok: false,
        message: options?.allowEndOfDay
          ? `${fieldLabel} must be HH:mm or 24:00`
          : `${fieldLabel} must be HH:mm`,
      };
    }
    const hours = Number(short[1]);
    const minutes = Number(short[2]);
    if (options?.allowEndOfDay && hours === 24 && minutes === 0) {
      return { ok: true, value: '24:00' };
    }
    if (hours > 23 || minutes > 59) {
      return {
        ok: false,
        message: options?.allowEndOfDay
          ? `${fieldLabel} must be HH:mm or 24:00`
          : `${fieldLabel} must be HH:mm`,
      };
    }
    return {
      ok: true,
      value: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
    };
  }

  private parseBoolean(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return false;
    }
    return (
      normalized === 'true' ||
      normalized === 'yes' ||
      normalized === 'y' ||
      normalized === '1'
    );
  }

  private timeToDate(value: string): Date {
    const [hours, minutes] = value.split(':').map(Number);
    return new Date(Date.UTC(1970, 0, 1, hours, minutes, 0));
  }

  private formatStoredTime(value: Date): string {
    const hours = value.getUTCHours().toString().padStart(2, '0');
    const minutes = value.getUTCMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
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
      // Time-only Excel cells often come as Date - format HH:mm in local excel serial
      const hours = value.getHours();
      const minutes = value.getMinutes();
      if (
        value.getFullYear() === 1899 ||
        value.getFullYear() === 1900 ||
        (hours !== 0 || minutes !== 0)
      ) {
        // Prefer UTC for consistency with stored times when date part is epoch-like
        const utcHours = value.getUTCHours();
        const utcMinutes = value.getUTCMinutes();
        if (value.getUTCFullYear() <= 1900) {
          return `${String(utcHours).padStart(2, '0')}:${String(utcMinutes).padStart(2, '0')}`;
        }
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      }
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
