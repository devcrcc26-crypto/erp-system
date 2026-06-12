import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { normalizeEmail } from '../../../../shared/utils/email.util';
import {
  ImportCommitResponseDto,
  ImportPreviewResponseDto,
  ImportRowPreviewDto,
} from '../dtos/user-import.dtos';
import { UserInvitationDispatchService } from './user-invitation-dispatch.service';
import {
  ProvisionedUser,
  UserProvisioningService,
} from './user-provisioning.service';
import { UserManagementService } from './user-management.service';

type AuditContext = { companyId: string; userId: string };

const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 500;

const ALLOWED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
]);

const HEADER_ALIASES: Record<string, keyof ParsedImportRow> = {
  email: 'email',
  'e-mail': 'email',
  firstname: 'firstName',
  'first name': 'firstName',
  first_name: 'firstName',
  lastname: 'lastName',
  'last name': 'lastName',
  last_name: 'lastName',
  role: 'role',
  'role name': 'role',
  rolename: 'role',
  phone: 'phone',
  telephone: 'phone',
  mobile: 'phone',
};

interface ParsedImportRow {
  line: number;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  phone?: string;
}

interface RoleLookup {
  id: string;
  name: string;
}

@Injectable()
export class UserImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userProvisioningService: UserProvisioningService,
    private readonly userInvitationDispatchService: UserInvitationDispatchService,
    private readonly userManagementService: UserManagementService,
  ) {}

  /**
   * Builds a downloadable Excel template for user import.
   */
  async buildTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Users');

    sheet.columns = [
      { header: 'email', key: 'email', width: 32 },
      { header: 'firstName', key: 'firstName', width: 18 },
      { header: 'lastName', key: 'lastName', width: 18 },
      { header: 'role', key: 'role', width: 22 },
      { header: 'phone', key: 'phone', width: 16 },
    ];

    sheet.addRow({
      email: 'user@company.local',
      firstName: 'Jane',
      lastName: 'Doe',
      role: 'Employee',
      phone: '',
    });

    const instructions = workbook.addWorksheet('Instructions');
    instructions.addRow(['Column', 'Required', 'Notes']);
    instructions.addRow(['email', 'Yes', 'Must be unique per company']);
    instructions.addRow(['firstName', 'Yes', '']);
    instructions.addRow(['lastName', 'Yes', '']);
    instructions.addRow([
      'role',
      'Yes',
      'Must match an existing role name exactly (e.g. Employee)',
    ]);
    instructions.addRow(['phone', 'No', 'Optional contact number']);
    instructions.addRow([]);
    instructions.addRow([
      'Note',
      '',
      'Imported users receive an activation email to verify their address and set a password.',
    ]);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Parses and validates an upload without writing to the database.
   */
  async previewImport(
    ctx: AuditContext,
    file: Express.Multer.File,
  ): Promise<ImportPreviewResponseDto> {
    const rows = await this.parseWorkbook(file);
    return this.validateRows(ctx, rows);
  }

  /**
   * Creates users from valid rows and optionally sends activation emails.
   */
  async commitImport(
    ctx: AuditContext,
    file: Express.Multer.File,
    sendInvitations: boolean,
  ): Promise<ImportCommitResponseDto> {
    const rows = await this.parseWorkbook(file);
    const preview = await this.validateRows(ctx, rows);

    const validRows = preview.rows.filter((row) => row.status === 'ok');
    const skipped = preview.rows.length - validRows.length;

    const createdUsers: ProvisionedUser[] = [];
    const errors: ImportCommitResponseDto['errors'] = [];

    for (const row of validRows) {
      try {
        const user = await this.userProvisioningService.provisionInvitedUser(
          ctx,
          {
            email: row.email,
            firstName: row.firstName,
            lastName: row.lastName,
            phone: row.phone,
            isActive: true,
          },
        );

        if (row.roleId) {
          await this.userManagementService.assignUserRole(ctx, user.id, {
            roleId: row.roleId,
          });
        }

        createdUsers.push(user);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to create user';
        errors.push({ line: row.line, email: row.email, message });
      }
    }

    let invitationsSent = 0;
    let invitationsFailed = 0;

    if (sendInvitations && createdUsers.length > 0) {
      const result =
        await this.userInvitationDispatchService.dispatchInvitations(
          createdUsers,
        );
      invitationsSent = result.sent;
      invitationsFailed = result.failed;
    }

    return {
      created: createdUsers.length,
      skipped: skipped + errors.length,
      invitationsSent,
      invitationsFailed,
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

    const requiredFields: Array<keyof ParsedImportRow> = [
      'email',
      'firstName',
      'lastName',
      'role',
    ];
    const mappedFields = new Set(columnMap.values());
    for (const field of requiredFields) {
      if (!mappedFields.has(field)) {
        throw new BadRequestException(
          `Missing required column: ${field}. Download the template for the correct format.`,
        );
      }
    }

    const rows: ParsedImportRow[] = [];

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      if (this.isRowEmpty(row)) {
        continue;
      }

      const parsed: ParsedImportRow = {
        line: rowNumber,
        email: '',
        firstName: '',
        lastName: '',
        role: '',
      };

      columnMap.forEach((field, colNumber) => {
        const value = this.cellToString(row.getCell(colNumber).value).trim();
        switch (field) {
          case 'email':
            parsed.email = value;
            break;
          case 'firstName':
            parsed.firstName = value;
            break;
          case 'lastName':
            parsed.lastName = value;
            break;
          case 'role':
            parsed.role = value;
            break;
          case 'phone':
            parsed.phone = value || undefined;
            break;
          default:
            break;
        }
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
  ): Promise<ImportPreviewResponseDto> {
    const roles = await this.loadRoles(ctx.companyId);
    const roleByNormalizedName = new Map(
      roles.map((role) => [this.normalizeRoleName(role.name), role]),
    );

    const emailsInFile = new Set<string>();
    const previewRows: ImportRowPreviewDto[] = [];

    for (const row of rows) {
      const preview = await this.validateRow(
        ctx,
        row,
        roleByNormalizedName,
        emailsInFile,
      );
      previewRows.push(preview);
      if (preview.status === 'ok') {
        emailsInFile.add(normalizeEmail(preview.email));
      }
    }

    const valid = previewRows.filter((row) => row.status === 'ok').length;
    const duplicate = previewRows.filter(
      (row) => row.status === 'duplicate' || row.status === 'duplicate_in_file',
    ).length;
    const invalid = previewRows.length - valid - duplicate;

    return {
      valid,
      invalid,
      duplicate,
      rows: previewRows,
    };
  }

  private async validateRow(
    ctx: AuditContext,
    row: ParsedImportRow,
    roleByNormalizedName: Map<string, RoleLookup>,
    emailsInFile: Set<string>,
  ): Promise<ImportRowPreviewDto> {
    const base = {
      line: row.line,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      role: row.role,
      phone: row.phone,
    };

    if (!row.email || !row.firstName || !row.lastName || !row.role) {
      return {
        ...base,
        status: 'error',
        message: 'email, firstName, lastName, and role are required',
      };
    }

    if (!this.isValidEmail(row.email)) {
      return {
        ...base,
        email: row.email,
        status: 'error',
        message: 'Invalid email address',
      };
    }

    const normalizedEmail = normalizeEmail(row.email);

    if (emailsInFile.has(normalizedEmail)) {
      return {
        ...base,
        email: normalizedEmail,
        status: 'duplicate_in_file',
        message: 'Duplicate email in this file',
      };
    }

    const existing = await this.userProvisioningService.findExistingUserByEmail(
      ctx.companyId,
      normalizedEmail,
    );

    if (existing) {
      return {
        ...base,
        email: normalizedEmail,
        status: 'duplicate',
        message: existing.emailVerifiedAt
          ? 'User with this email already exists'
          : 'User already exists and is pending activation',
      };
    }

    const role = roleByNormalizedName.get(this.normalizeRoleName(row.role));
    if (!role) {
      return {
        ...base,
        email: normalizedEmail,
        status: 'error',
        message: `Unknown role: ${row.role}`,
      };
    }

    return {
      ...base,
      email: normalizedEmail,
      status: 'ok',
      roleId: role.id,
    };
  }

  private async loadRoles(companyId: string): Promise<RoleLookup[]> {
    return this.prisma.role.findMany({
      where: activeOnly({ companyId }),
      select: { id: true, name: true },
      orderBy: { name: Prisma.SortOrder.asc },
    });
  }

  private async loadWorkbookFromBuffer(
    buffer: Buffer,
  ): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook();
    // exceljs Buffer typings differ from Node multer buffers across @types/node versions
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
      throw new BadRequestException(
        'Only .xlsx Excel files are supported',
      );
    }
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
  }

  private normalizeHeader(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private normalizeRoleName(value: string): string {
    return value.trim().toLowerCase();
  }

  private cellToString(value: ExcelJS.CellValue): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'object' && 'text' in value) {
      return String(value.text ?? '');
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    return String(value);
  }

  private isRowEmpty(row: ExcelJS.Row): boolean {
    let hasValue = false;
    row.eachCell({ includeEmpty: false }, () => {
      hasValue = true;
    });
    return !hasValue;
  }
}
