import { BadRequestException, Injectable } from '@nestjs/common';
import {
  EmployeeContractStatus,
  EmployeeContractType,
} from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { normalizeEmail } from '../../../../shared/utils/email.util';
import {
  ImportCommitResponseDto,
} from '../../../hr-shared/application/dtos/hr-import.dtos';
import { CreateEmployeeContractDto } from '../dtos/employee-contract.dtos';
import {
  EmployeeContractImportPreviewResponseDto,
  EmployeeContractImportRowPreviewDto,
} from '../dtos/employee-contract-import.dtos';
import { EmployeeContractService } from './employee-contract.service';

type AuditContext = { companyId: string; userId: string };

const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 500;

const ALLOWED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
]);

const CONTRACT_TYPE_VALUES = Object.values(EmployeeContractType);

const HEADER_ALIASES: Record<string, keyof ParsedImportRow> = {
  employeeemail: 'employeeEmail',
  'employee email': 'employeeEmail',
  employee_email: 'employeeEmail',
  email: 'employeeEmail',
  employeeid: 'employeeId',
  'employee id': 'employeeId',
  employee_id: 'employeeId',
  contracttype: 'contractType',
  'contract type': 'contractType',
  contract_type: 'contractType',
  signedat: 'signedAt',
  'signed at': 'signedAt',
  signed_at: 'signedAt',
  startdate: 'startDate',
  'start date': 'startDate',
  start_date: 'startDate',
  enddate: 'endDate',
  'end date': 'endDate',
  end_date: 'endDate',
  basicsalary: 'basicSalary',
  'basic salary': 'basicSalary',
  basic_salary: 'basicSalary',
  transportationallowance: 'transportationAllowance',
  'transportation allowance': 'transportationAllowance',
  transportation_allowance: 'transportationAllowance',
  monthlybonus: 'monthlyBonus',
  'monthly bonus': 'monthlyBonus',
  monthly_bonus: 'monthlyBonus',
  monthlynetbonus: 'monthlyNetBonus',
  'monthly net bonus': 'monthlyNetBonus',
  monthly_net_bonus: 'monthlyNetBonus',
  pensionapplicable: 'pensionApplicable',
  'pension applicable': 'pensionApplicable',
  pension_applicable: 'pensionApplicable',
  taxapplicable: 'taxApplicable',
  'tax applicable': 'taxApplicable',
  tax_applicable: 'taxApplicable',
  probationenddate: 'probationEndDate',
  'probation end date': 'probationEndDate',
  probation_end_date: 'probationEndDate',
  governedby: 'governedBy',
  'governed by': 'governedBy',
  governed_by: 'governedBy',
  notes: 'notes',
};

interface ParsedImportRow {
  line: number;
  employeeEmail: string;
  employeeId: string;
  contractType: string;
  signedAt: string;
  startDate: string;
  endDate: string;
  basicSalary: string;
  transportationAllowance: string;
  monthlyBonus: string;
  monthlyNetBonus: string;
  pensionApplicable: string;
  taxApplicable: string;
  probationEndDate: string;
  governedBy: string;
  notes: string;
}

const DATE_FIELDS = new Set<keyof ParsedImportRow>([
  'signedAt',
  'startDate',
  'endDate',
  'probationEndDate',
]);

/**
 * Excel template / preview / commit for employee contracts.
 */
@Injectable()
export class EmployeeContractImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employeeContractService: EmployeeContractService,
  ) {}

  /**
   * Builds a downloadable Excel template for employee contract import.
   */
  async buildTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Contracts');

    sheet.columns = [
      { header: 'employeeEmail', key: 'employeeEmail', width: 28 },
      { header: 'employeeId', key: 'employeeId', width: 36 },
      { header: 'contractType', key: 'contractType', width: 14 },
      { header: 'signedAt', key: 'signedAt', width: 12 },
      { header: 'startDate', key: 'startDate', width: 12 },
      { header: 'endDate', key: 'endDate', width: 12 },
      { header: 'basicSalary', key: 'basicSalary', width: 12 },
      {
        header: 'transportationAllowance',
        key: 'transportationAllowance',
        width: 20,
      },
      { header: 'monthlyBonus', key: 'monthlyBonus', width: 12 },
      { header: 'monthlyNetBonus', key: 'monthlyNetBonus', width: 14 },
      { header: 'pensionApplicable', key: 'pensionApplicable', width: 16 },
      { header: 'taxApplicable', key: 'taxApplicable', width: 14 },
      { header: 'probationEndDate', key: 'probationEndDate', width: 16 },
      { header: 'governedBy', key: 'governedBy', width: 36 },
      { header: 'notes', key: 'notes', width: 24 },
    ];

    sheet.addRow({
      employeeEmail: 'employee@company.local',
      employeeId: '',
      contractType: 'FIXED_TERM',
      signedAt: '2026-01-15',
      startDate: '2026-02-01',
      endDate: '2027-01-31',
      basicSalary: 25000,
      transportationAllowance: 3000,
      monthlyBonus: 2000,
      monthlyNetBonus: 0,
      pensionApplicable: true,
      taxApplicable: true,
      probationEndDate: '',
      governedBy: 'Ethiopian Labor Proclamation 1156/2019',
      notes: 'Sample import row',
    });

    const instructions = workbook.addWorksheet('Instructions');
    instructions.addRow(['Column', 'Required', 'Notes']);
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
    instructions.addRow([
      'contractType',
      'Yes',
      'FIXED_TERM | OPEN_ENDED | PROBATION | RENEWAL',
    ]);
    instructions.addRow([
      'signedAt',
      'No',
      'YYYY-MM-DD - defaults to startDate when blank',
    ]);
    instructions.addRow(['startDate', 'Yes', 'YYYY-MM-DD']);
    instructions.addRow([
      'endDate',
      'Conditional',
      'Required for FIXED_TERM, PROBATION, RENEWAL',
    ]);
    instructions.addRow(['basicSalary', 'No', 'Number (ETB)']);
    instructions.addRow(['transportationAllowance', 'No', 'Number (ETB)']);
    instructions.addRow(['monthlyBonus', 'No', 'Number (ETB), default 0']);
    instructions.addRow([
      'monthlyNetBonus',
      'No',
      'Number (ETB), after-tax net bonus, default 0',
    ]);
    instructions.addRow([
      'pensionApplicable',
      'No',
      'true | false (default true)',
    ]);
    instructions.addRow(['taxApplicable', 'No', 'true | false (default true)']);
    instructions.addRow(['probationEndDate', 'No', 'YYYY-MM-DD']);
    instructions.addRow(['governedBy', 'No', 'Governing law / proclamation']);
    instructions.addRow(['notes', 'No', 'Optional notes']);
    instructions.addRow([]);
    instructions.addRow([
      'Note',
      '',
      'Currency is always ETB. Employees with an existing ACTIVE contract are skipped as duplicates.',
    ]);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Creates contracts from valid rows via EmployeeContractService.createContract.
   */
  async commitImport(
    ctx: AuditContext,
    file: Express.Multer.File,
  ): Promise<ImportCommitResponseDto> {
    const rows = await this.parseWorkbook(file);
    const preview = await this.validateRows(ctx, rows);

    const validRows = preview.rows.filter(
      (row): row is EmployeeContractImportRowPreviewDto & {
        status: 'ok';
        employeeId: string;
        contractType: EmployeeContractType;
        signedAt: string;
        startDate: string;
      } => row.status === 'ok' && Boolean(row.employeeId) && Boolean(row.contractType),
    );
    const skipped = preview.rows.length - validRows.length;
    const errors: ImportCommitResponseDto['errors'] = [];
    let created = 0;

    for (const row of validRows) {
      try {
        const dto: CreateEmployeeContractDto = {
          employeeId: row.employeeId,
          contractType: row.contractType,
          signedAt: row.signedAt,
          startDate: row.startDate,
          endDate: row.endDate,
          basicSalary: row.basicSalary,
          transportationAllowance: row.transportationAllowance,
          monthlyBonus: row.monthlyBonus,
          monthlyNetBonus: row.monthlyNetBonus,
          pensionApplicable: row.pensionApplicable,
          taxApplicable: row.taxApplicable,
          probationEndDate: row.probationEndDate,
          governedBy: row.governedBy,
          notes: row.notes,
        };
        await this.employeeContractService.createContract(
          dto,
          ctx.companyId,
          ctx.userId,
        );
        created += 1;
      } catch (error) {
        errors.push({
          line: row.line,
          label: row.label,
          message: error instanceof Error ? error.message : 'Failed to create contract',
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
    if (!mapped.has('contractType') || !mapped.has('startDate')) {
      throw new BadRequestException(
        'Missing required columns: contractType, startDate. Download the template.',
      );
    }
    if (!mapped.has('employeeEmail') && !mapped.has('employeeId')) {
      throw new BadRequestException(
        'Missing employeeEmail or employeeId column. Download the template.',
      );
    }

    const rows: ParsedImportRow[] = [];
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      if (this.isRowEmpty(row)) {
        continue;
      }

      const parsed: ParsedImportRow = {
        line: rowNumber,
        employeeEmail: '',
        employeeId: '',
        contractType: '',
        signedAt: '',
        startDate: '',
        endDate: '',
        basicSalary: '',
        transportationAllowance: '',
        monthlyBonus: '',
        monthlyNetBonus: '',
        pensionApplicable: '',
        taxApplicable: '',
        probationEndDate: '',
        governedBy: '',
        notes: '',
      };

      columnMap.forEach((field, colNumber) => {
        const raw = this.cellToString(row.getCell(colNumber).value);
        const record = parsed as unknown as Record<string, string | number>;
        if (DATE_FIELDS.has(field)) {
          record[field] = this.normalizeDateCell(raw);
        } else {
          record[field] = raw;
        }
      });

      rows.push(parsed);
      if (rows.length > MAX_IMPORT_ROWS) {
        throw new BadRequestException(
          `Import is limited to ${MAX_IMPORT_ROWS} data rows`,
        );
      }
    }

    return rows;
  }

  async previewImport(
    ctx: AuditContext,
    file: Express.Multer.File,
  ): Promise<EmployeeContractImportPreviewResponseDto> {
    const rows = await this.parseWorkbook(file);
    return this.validateRows(ctx, rows);
  }

  private async validateRows(
    ctx: AuditContext,
    rows: ParsedImportRow[],
  ): Promise<EmployeeContractImportPreviewResponseDto> {
    const previewRows: EmployeeContractImportRowPreviewDto[] = [];
    for (const row of rows) {
      previewRows.push(await this.validateRow(ctx, row));
    }
    return {
      valid: previewRows.filter((r) => r.status === 'ok').length,
      invalid: previewRows.filter((r) => r.status === 'error').length,
      duplicate: previewRows.filter((r) => r.status === 'duplicate').length,
      rows: previewRows,
    };
  }

  private async validateRow(
    ctx: AuditContext,
    row: ParsedImportRow,
  ): Promise<EmployeeContractImportRowPreviewDto> {
    const label =
      row.employeeEmail.trim() ||
      row.employeeId.trim() ||
      `Row ${row.line}`;
    const base: EmployeeContractImportRowPreviewDto = {
      line: row.line,
      label,
      status: 'error',
      employeeEmail: row.employeeEmail.trim() || undefined,
      employeeId: row.employeeId.trim() || undefined,
    };

    const employee = await this.resolveEmployee(ctx.companyId, row);
    if (!employee.ok) {
      return { ...base, status: 'error', message: employee.message };
    }
    base.employeeId = employee.id;
    base.employeeEmail = employee.email ?? base.employeeEmail;
    base.label =
      `${employee.firstName} ${employee.lastName}`.trim() || label;

    const contractTypeResult = this.parseEnumField(
      row.contractType,
      CONTRACT_TYPE_VALUES,
      'contractType',
      true,
    );
    if (!contractTypeResult.ok) {
      return { ...base, status: 'error', message: contractTypeResult.message };
    }

    const signedAtResult = this.parseImportDate(row.signedAt, 'signedAt', false);
    if (!signedAtResult.ok) {
      return { ...base, status: 'error', message: signedAtResult.message };
    }

    const startDateResult = this.parseImportDate(row.startDate, 'startDate', true);
    if (!startDateResult.ok) {
      return { ...base, status: 'error', message: startDateResult.message };
    }

    // Create DTO / DB require signedAt - default to startDate when omitted
    const signedAt = signedAtResult.value ?? startDateResult.value!;

    const endDateResult = this.parseImportDate(row.endDate, 'endDate', false);
    if (!endDateResult.ok) {
      return { ...base, status: 'error', message: endDateResult.message };
    }

    const requiresEndDate =
      contractTypeResult.value === EmployeeContractType.FIXED_TERM ||
      contractTypeResult.value === EmployeeContractType.PROBATION ||
      contractTypeResult.value === EmployeeContractType.RENEWAL;
    if (requiresEndDate && !endDateResult.value) {
      return {
        ...base,
        status: 'error',
        message: `endDate is required for ${contractTypeResult.value}`,
      };
    }

    const basicSalary = this.parseOptionalNumber(row.basicSalary, 'basicSalary');
    if (!basicSalary.ok) {
      return { ...base, status: 'error', message: basicSalary.message };
    }
    const transportationAllowance = this.parseOptionalNumber(
      row.transportationAllowance,
      'transportationAllowance',
    );
    if (!transportationAllowance.ok) {
      return {
        ...base,
        status: 'error',
        message: transportationAllowance.message,
      };
    }
    const monthlyBonus = this.parseOptionalNumber(row.monthlyBonus, 'monthlyBonus');
    if (!monthlyBonus.ok) {
      return { ...base, status: 'error', message: monthlyBonus.message };
    }
    const monthlyNetBonus = this.parseOptionalNumber(
      row.monthlyNetBonus,
      'monthlyNetBonus',
    );
    if (!monthlyNetBonus.ok) {
      return { ...base, status: 'error', message: monthlyNetBonus.message };
    }

    const pensionApplicable = this.parseOptionalBoolean(
      row.pensionApplicable,
      'pensionApplicable',
      true,
    );
    if (!pensionApplicable.ok) {
      return { ...base, status: 'error', message: pensionApplicable.message };
    }
    const taxApplicable = this.parseOptionalBoolean(
      row.taxApplicable,
      'taxApplicable',
      true,
    );
    if (!taxApplicable.ok) {
      return { ...base, status: 'error', message: taxApplicable.message };
    }

    const probationEndDateResult = this.parseImportDate(
      row.probationEndDate,
      'probationEndDate',
      false,
    );
    if (!probationEndDateResult.ok) {
      return {
        ...base,
        status: 'error',
        message: probationEndDateResult.message,
      };
    }

    const activeExisting = await this.prisma.employeeContract.findFirst({
      where: activeOnly({
        companyId: ctx.companyId,
        employeeId: employee.id,
        status: EmployeeContractStatus.ACTIVE,
      }),
      select: { id: true, contractNumber: true },
    });
    if (activeExisting) {
      return {
        ...base,
        status: 'duplicate',
        message: `Employee already has an active contract (${activeExisting.contractNumber})`,
        contractType: contractTypeResult.value,
        signedAt,
        startDate: startDateResult.value,
        endDate: endDateResult.value,
      };
    }

    return {
      ...base,
      status: 'ok',
      contractType: contractTypeResult.value,
      signedAt,
      startDate: startDateResult.value,
      endDate: endDateResult.value,
      basicSalary: basicSalary.value,
      transportationAllowance: transportationAllowance.value,
      monthlyBonus: monthlyBonus.value,
      monthlyNetBonus: monthlyNetBonus.value,
      pensionApplicable: pensionApplicable.value,
      taxApplicable: taxApplicable.value,
      probationEndDate: probationEndDateResult.value,
      governedBy: row.governedBy.trim() || undefined,
      notes: row.notes.trim() || undefined,
    };
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
        },
      });
      if (!user) {
        return { ok: false, message: `No employee found for email ${email}` };
      }
      return {
        ok: true,
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      };
    }

    if (!employeeId) {
      return {
        ok: false,
        message: 'employeeEmail or employeeId is required',
      };
    }
    if (!this.isUuid(employeeId)) {
      return { ok: false, message: 'employeeId must be a UUID' };
    }
    const user = await this.prisma.user.findFirst({
      where: activeOnly({ companyId, id: employeeId }),
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });
    if (!user) {
      return { ok: false, message: `No employee found for id ${employeeId}` };
    }
    return {
      ok: true,
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }

  private parseEnumField<T extends string>(
    value: string,
    allowed: readonly T[],
    fieldLabel: string,
    required: boolean,
  ):
    | { ok: true; value: T }
    | { ok: false; message: string } {
    if (!value.trim()) {
      if (required) {
        return { ok: false, message: `${fieldLabel} is required` };
      }
      return { ok: false, message: `${fieldLabel} is required` };
    }
    const normalized = value.trim().toUpperCase();
    const match = allowed.find((entry) => entry === normalized);
    if (!match) {
      return { ok: false, message: `Unknown ${fieldLabel}: ${value}` };
    }
    return { ok: true, value: match };
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
    if (!Number.isFinite(num)) {
      return { ok: false, message: `Invalid ${fieldLabel}: must be a number` };
    }
    return { ok: true, value: num };
  }

  private parseOptionalBoolean(
    value: string,
    fieldLabel: string,
    defaultValue: boolean,
  ):
    | { ok: true; value: boolean }
    | { ok: false; message: string } {
    if (!value.trim()) {
      return { ok: true, value: defaultValue };
    }
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) {
      return { ok: true, value: true };
    }
    if (['false', '0', 'no', 'n'].includes(normalized)) {
      return { ok: true, value: false };
    }
    return {
      ok: false,
      message: `Invalid ${fieldLabel}: use true or false`,
    };
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
    if (value == null) {
      return '';
    }
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value).trim();
    }
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    if (value instanceof Date) {
      return value.toISOString().slice(0, 10);
    }
    if (typeof value === 'object' && 'text' in value && typeof value.text === 'string') {
      return value.text.trim();
    }
    if (typeof value === 'object' && 'result' in value) {
      return this.cellToString(value.result as ExcelJS.CellValue);
    }
    return String(value).trim();
  }

  private normalizeDateCell(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) {
      return '';
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }
    const asDate = new Date(trimmed);
    if (!Number.isNaN(asDate.getTime())) {
      return asDate.toISOString().slice(0, 10);
    }
    return trimmed;
  }

  private isRowEmpty(row: ExcelJS.Row): boolean {
    let empty = true;
    row.eachCell({ includeEmpty: false }, () => {
      empty = false;
    });
    return empty;
  }
}
