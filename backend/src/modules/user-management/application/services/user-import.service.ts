import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import {
  EducationLevel,
  EmployeeType,
  Gender,
  Nationality,
  Prisma,
  UserDiscipline,
} from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { normalizeEmail } from '../../../../shared/utils/email.util';
import {
  findHeaderRowNumber,
  isExportFooterRow,
} from '../../../../shared/utils/excel-header-row.util';
import { parseUserDisciplineInput } from '../../../../shared/user-discipline';
import {
  ImportCommitResponseDto,
  ImportPreviewResponseDto,
  ImportRowPreviewDto,
} from '../dtos/user-import.dtos';
import { TIN_PATTERN, YEARS_OF_EXPERIENCE_MAX } from '../dtos/user-field.rules';
import { UserInvitationDispatchService } from './user-invitation-dispatch.service';
import {
  ProvisionedUser,
  ProvisionRecordOnlyUserInput,
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

const GENDER_VALUES = Object.values(Gender);
const NATIONALITY_VALUES = Object.values(Nationality);
const EMPLOYEE_TYPE_VALUES = Object.values(EmployeeType);
const EDUCATION_LEVEL_VALUES = Object.values(EducationLevel);

const HEADER_ALIASES: Record<string, keyof ParsedImportRow> = {
  email: 'email',
  'e-mail': 'email',
  firstname: 'firstName',
  'first name': 'firstName',
  first_name: 'firstName',
  lastname: 'lastName',
  'last name': 'lastName',
  last_name: 'lastName',
  middlename: 'middleName',
  'middle name': 'middleName',
  middle_name: 'middleName',
  chinesename: 'chineseName',
  'chinese name': 'chineseName',
  chinese_name: 'chineseName',
  name_zh: 'chineseName',
  'chinese full name': 'chineseName',
  role: 'role',
  'role name': 'role',
  rolename: 'role',
  phone: 'phone',
  telephone: 'phone',
  mobile: 'phone',
  discipline: 'discipline',
  'engineering discipline': 'discipline',
  gender: 'gender',
  department: 'department',
  'department name': 'department',
  position: 'position',
  'position title': 'position',
  title: 'position',
  employeeid: 'employeeId',
  'employee id': 'employeeId',
  employee_id: 'employeeId',
  nationality: 'nationality',
  employeetype: 'employeeType',
  'employee type': 'employeeType',
  employee_type: 'employeeType',
  addresscountry: 'addressCountry',
  'address country': 'addressCountry',
  address_country: 'addressCountry',
  country: 'addressCountry',
  addressregion: 'addressRegion',
  'address region': 'addressRegion',
  address_region: 'addressRegion',
  region: 'addressRegion',
  addresscity: 'addressCity',
  'address city': 'addressCity',
  address_city: 'addressCity',
  city: 'addressCity',
  addresssubcity: 'addressSubcity',
  'address subcity': 'addressSubcity',
  address_subcity: 'addressSubcity',
  subcity: 'addressSubcity',
  addressworeda: 'addressWoreda',
  'address woreda': 'addressWoreda',
  address_woreda: 'addressWoreda',
  woreda: 'addressWoreda',
  addresshousenumber: 'addressHouseNumber',
  'address house number': 'addressHouseNumber',
  address_house_number: 'addressHouseNumber',
  housenumber: 'addressHouseNumber',
  'house number': 'addressHouseNumber',
  dateofbirth: 'dateOfBirth',
  'date of birth': 'dateOfBirth',
  date_of_birth: 'dateOfBirth',
  dob: 'dateOfBirth',
  nationalid: 'nationalId',
  'national id': 'nationalId',
  national_id: 'nationalId',
  tin: 'tin',
  'tin number': 'tin',
  'tin no': 'tin',
  'tin no.': 'tin',
  tin_number: 'tin',
  tinnumber: 'tin',
  'tax id': 'tin',
  'tax identification number': 'tin',
  educationlevel: 'educationLevel',
  'education level': 'educationLevel',
  education_level: 'educationLevel',
  fieldofstudy: 'fieldOfStudy',
  'field of study': 'fieldOfStudy',
  field_of_study: 'fieldOfStudy',
  yearsofexperience: 'yearsOfExperience',
  'years of experience': 'yearsOfExperience',
  years_of_experience: 'yearsOfExperience',
  experience: 'yearsOfExperience',
  employmentdate: 'employmentDate',
  'employment date': 'employmentDate',
  'employment start date': 'employmentDate',
  'date of employment': 'employmentDate',
  'date of employmt': 'employmentDate',
  'date of employt': 'employmentDate',
  hiredate: 'employmentDate',
  'hire date': 'employmentDate',
  leavepolicy: 'leavePolicy',
  'leave policy': 'leavePolicy',
  leave_policy: 'leavePolicy',
};

/** Spreadsheet labels → catalog position titles (case-insensitive keys). */
const POSITION_ALIASES: Record<string, string> = {
  'admin assistant (directorate)': 'Admin Assistant',
  'admin assistant (directore)': 'Admin Assistant',
  'mechanical eng.': 'Mechanical Engineer',
  'mechanical eng': 'Mechanical Engineer',
  'pavement eng.': 'Pavement Engineer',
  'pavement eng': 'Pavement Engineer',
  'chief surveyor': 'Surveyor',
  'junior surveyor': 'Surveyor',
  'structure eng.': 'Structural Engineer',
  'structure eng': 'Structural Engineer',
  'structural eng.': 'Structural Engineer',
  'structural eng': 'Structural Engineer',
  'stru. eng./office eng.': 'Structural Engineer',
  'stru. des./office eng.': 'Structural Engineer',
  'highway eng.': 'Highway Engineer',
  'highway eng': 'Highway Engineer',
  'highway office eng.': 'Highway Engineer',
  'highway office eng': 'Highway Engineer',
  'highway/road eng.': 'Highway Engineer',
  'highway/road eng': 'Highway Engineer',
  'highway/rural eng.': 'Highway Engineer',
  'highway/rural eng': 'Highway Engineer',
  'highway structural': 'Structural Engineer',
  'highway/structural eng': 'Structural Engineer',
  'highway/structural eng.': 'Structural Engineer',
  'geological eng.': 'Geological Engineer',
  'geological eng': 'Geological Engineer',
  'sanitary eng.': 'Sanitary Engineer',
  'sanitary eng': 'Sanitary Engineer',
  'junior electrical eng': 'Electrical Engineer',
  'junior electrical eng.': 'Electrical Engineer',
  'senior electrical eng.': 'Electrical Engineer',
  'senior electrical eng': 'Electrical Engineer',
  'senior electrical engineer': 'Electrical Engineer',
  'electrical eng.': 'Electrical Engineer',
  'electrical eng': 'Electrical Engineer',
  'hydraulic eng.': 'Hydraulic Engineer',
  'hydraulic eng': 'Hydraulic Engineer',
  'senior hydrologist (freelancer)': 'Hydraulic Engineer',
  'senior hydrologist': 'Hydraulic Engineer',
  'leader architect': 'Architect',
  'architectural eng.': 'Architect',
  'architectural eng': 'Architect',
  'hr manager': 'Human Resource Manager',
  'hr assistant': 'Human Resource Assistant',
  'senior communication & publicity officer':
    'Communication & Publicity Officer',
  'geotechnical/material eng': 'Geotechnical Engineer',
  'geotechnical/material eng.': 'Geotechnical Engineer',
  'material eng.': 'Material Engineer',
  'material eng': 'Material Engineer',
  'contract eng.': 'Contract Engineer',
  'contract eng': 'Contract Engineer',
  'deputy general manager': 'Deputy General',
  'software eng/erp developer': 'Software Engineer (ERP Developer)',
  'software eng-erp (developer)': 'Software Engineer (ERP Developer)',
  'software engineer (erp developer)': 'Software Engineer (ERP Developer)',
  'purchase officer': 'Purchase Officer',
  'purchaser officer': 'Purchase Officer',
  'site engineer': 'Highway Engineer',
};

interface ParsedImportRow {
  line: number;
  email: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  chineseName?: string;
  role: string;
  phone?: string;
  discipline?: string;
  gender?: string;
  department?: string;
  position?: string;
  employeeId?: string;
  nationality?: string;
  employeeType?: string;
  addressCountry?: string;
  addressRegion?: string;
  addressCity?: string;
  addressSubcity?: string;
  addressWoreda?: string;
  addressHouseNumber?: string;
  dateOfBirth?: string;
  nationalId?: string;
  tin?: string;
  educationLevel?: string;
  fieldOfStudy?: string;
  employmentDate?: string;
  yearsOfExperience?: string;
  leavePolicy?: string;
}

interface RoleLookup {
  id: string;
  name: string;
}

interface NamedLookup {
  id: string;
  name: string;
}

interface ImportLookups {
  roleByNormalizedName: Map<string, RoleLookup>;
  departmentByNormalizedName: Map<string, NamedLookup>;
  positionByNormalizedTitle: Map<string, NamedLookup>;
  leavePolicyByNormalizedName: Map<string, NamedLookup>;
  disciplineByNormalizedName: Map<string, NamedLookup>;
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
      { header: 'firstName', key: 'firstName', width: 16 },
      { header: 'lastName', key: 'lastName', width: 16 },
      { header: 'middleName', key: 'middleName', width: 16 },
      { header: 'chineseName', key: 'chineseName', width: 16 },
      { header: 'role', key: 'role', width: 20 },
      { header: 'phone', key: 'phone', width: 14 },
      { header: 'discipline', key: 'discipline', width: 20 },
      { header: 'gender', key: 'gender', width: 10 },
      { header: 'department', key: 'department', width: 20 },
      { header: 'position', key: 'position', width: 20 },
      { header: 'employeeId', key: 'employeeId', width: 14 },
      { header: 'nationality', key: 'nationality', width: 12 },
      { header: 'employeeType', key: 'employeeType', width: 14 },
      { header: 'dateOfBirth', key: 'dateOfBirth', width: 14 },
      { header: 'nationalId', key: 'nationalId', width: 16 },
      { header: 'tin', key: 'tin', width: 14 },
      { header: 'educationLevel', key: 'educationLevel', width: 14 },
      { header: 'fieldOfStudy', key: 'fieldOfStudy', width: 18 },
      { header: 'employmentDate', key: 'employmentDate', width: 18 },
      { header: 'yearsOfExperience', key: 'yearsOfExperience', width: 18 },
      { header: 'addressCountry', key: 'addressCountry', width: 14 },
      { header: 'addressRegion', key: 'addressRegion', width: 14 },
      { header: 'addressCity', key: 'addressCity', width: 14 },
      { header: 'addressSubcity', key: 'addressSubcity', width: 14 },
      { header: 'addressWoreda', key: 'addressWoreda', width: 14 },
      { header: 'addressHouseNumber', key: 'addressHouseNumber', width: 16 },
      { header: 'leavePolicy', key: 'leavePolicy', width: 18 },
    ];

    sheet.addRow({
      email: 'user@company.local',
      firstName: 'Jane',
      lastName: 'Doe',
      middleName: 'A',
      chineseName: '',
      role: 'Employee',
      phone: '',
      discipline: 'Highway',
      gender: 'FEMALE',
      department: 'Engineering Management Department',
      position: 'Highway Engineer',
      employeeId: '',
      nationality: 'ETHIOPIAN',
      employeeType: 'PERMANENT',
      dateOfBirth: '1990-05-15',
      nationalId: '',
      tin: '',
      educationLevel: 'BSC',
      fieldOfStudy: 'Civil Engineering',
      employmentDate: '2024-03-01',
      yearsOfExperience: '8',
      addressCountry: 'Ethiopia',
      addressRegion: 'Addis Ababa',
      addressCity: 'Addis Ababa',
      addressSubcity: '',
      addressWoreda: '',
      addressHouseNumber: '',
      leavePolicy: '',
    });
    sheet.addRow({
      email: '',
      firstName: 'Wei',
      lastName: 'Zhang',
      middleName: '',
      chineseName: '张伟',
      role: 'Employee',
      phone: '',
      discipline: 'Highway',
      gender: 'MALE',
      department: '',
      position: '',
      employeeId: '',
      nationality: 'CHINESE',
      employeeType: 'CONTRACT',
      dateOfBirth: '',
      nationalId: '',
      tin: '',
      educationLevel: 'MSC',
      fieldOfStudy: '',
      employmentDate: '',
      yearsOfExperience: '',
      addressCountry: '',
      addressRegion: '',
      addressCity: '',
      addressSubcity: '',
      addressWoreda: '',
      addressHouseNumber: '',
      leavePolicy: '',
    });

    const instructions = workbook.addWorksheet('Instructions');
    instructions.addRow(['Column', 'Required', 'Notes']);
    instructions.addRow([
      'email',
      'No',
      'Optional. Leave blank for record-only users who will not log in.',
    ]);
    instructions.addRow(['firstName', 'Yes', '']);
    instructions.addRow(['lastName', 'No', 'Optional']);
    instructions.addRow(['middleName', 'No', 'Optional middle name']);
    instructions.addRow([
      'chineseName',
      'No',
      'Chinese full name (中文姓名) - recommended when email is blank',
    ]);
    instructions.addRow([
      'role',
      'No',
      'Optional - must match an existing role name exactly (e.g. Employee) when provided',
    ]);
    instructions.addRow(['phone', 'No', 'Optional contact number']);
    instructions.addRow([
      'discipline',
      'No',
      'UserDiscipline enum label/key (e.g. Highway) and/or engineering discipline catalog name',
    ]);
    instructions.addRow(['gender', 'No', 'MALE or FEMALE (Male/Female also accepted)']);
    instructions.addRow([
      'department',
      'No',
      'Must match an existing department name (case-insensitive)',
    ]);
    instructions.addRow([
      'position',
      'No',
      'Must match an existing position title (common abbreviations like Structure Eng. are accepted)',
    ]);
    instructions.addRow(['employeeId', 'No', 'Unique employee number when provided']);
    instructions.addRow(['nationality', 'No', 'ETHIOPIAN or CHINESE']);
    instructions.addRow([
      'employeeType',
      'No',
      'PERMANENT, CONTRACT, TEMPORARY, or FREELANCER',
    ]);
    instructions.addRow(['dateOfBirth', 'No', 'YYYY-MM-DD or DD/MM/YYYY']);
    instructions.addRow(['nationalId', 'No', 'National ID / passport number']);
    instructions.addRow(['tin', 'No', 'Tax Identification Number (10 digits)']);
    instructions.addRow([
      'educationLevel',
      'No',
      'PHD, MSC, BSC, DIPLOMA, CERTIFICATE, TECHNICIAN, SECONDARY, PRIMARY, or OTHER',
    ]);
    instructions.addRow(['fieldOfStudy', 'No', '']);
    instructions.addRow([
      'employmentDate',
      'No',
      'YYYY-MM-DD or DD/MM/YYYY (aliases: hire date, date of employment)',
    ]);
    instructions.addRow([
      'yearsOfExperience',
      'No',
      'Years of career experience as of the import date, e.g. 8 or 6.5',
    ]);
    instructions.addRow(['addressCountry', 'No', '']);
    instructions.addRow(['addressRegion', 'No', '']);
    instructions.addRow(['addressCity', 'No', '']);
    instructions.addRow(['addressSubcity', 'No', '']);
    instructions.addRow(['addressWoreda', 'No', '']);
    instructions.addRow(['addressHouseNumber', 'No', '']);
    instructions.addRow([
      'leavePolicy',
      'No',
      'Must match an existing leave policy name (case-insensitive)',
    ]);
    instructions.addRow([]);
    instructions.addRow([
      'Note',
      '',
      'Rows with an email receive an activation email. Rows without an email are record-only (no login).',
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
        const shared: ProvisionRecordOnlyUserInput = {
          firstName: row.firstName,
          lastName: row.lastName,
          middleName: row.middleName,
          chineseName: row.chineseName,
          phone: row.phone,
          departmentId: row.departmentId,
          positionId: row.positionId,
          leavePolicyId: row.leavePolicyId,
          discipline: row.discipline ?? undefined,
          engineeringDisciplineId: row.engineeringDisciplineId,
          employeeId: row.employeeId,
          gender: row.gender ?? undefined,
          nationality: row.nationality ?? undefined,
          employeeType: row.employeeType ?? undefined,
          educationLevel: row.educationLevel ?? undefined,
          dateOfBirth: row.dateOfBirth,
          nationalId: row.nationalId,
          tin: row.tin,
          fieldOfStudy: row.fieldOfStudy,
          employmentDate: row.employmentDate,
          yearsOfExperience:
            row.yearsOfExperience != null && row.yearsOfExperience !== ''
              ? Number(row.yearsOfExperience)
              : undefined,
          addressCountry: row.addressCountry,
          addressRegion: row.addressRegion,
          addressCity: row.addressCity,
          addressSubcity: row.addressSubcity,
          addressWoreda: row.addressWoreda,
          addressHouseNumber: row.addressHouseNumber,
          isActive: true,
        };

        const user = row.email
          ? await this.userProvisioningService.provisionInvitedUser(ctx, {
              email: row.email,
              ...shared,
            })
          : await this.userProvisioningService.provisionRecordOnlyUser(
              ctx,
              shared,
            );

        if (row.roleId) {
          await this.userManagementService.assignUserRole(ctx, user.id, {
            roleId: row.roleId,
          });
        }

        createdUsers.push(user);
      } catch (error) {
        errors.push({
          line: row.line,
          email: row.email || undefined,
          message: this.formatImportError(error),
        });
      }
    }

    let invitationsSent = 0;
    let invitationsFailed = 0;

    if (sendInvitations && createdUsers.length > 0) {
      const invitees = createdUsers.filter((user) => Boolean(user.email));
      if (invitees.length > 0) {
        const result =
          await this.userInvitationDispatchService.dispatchInvitations(
            invitees,
          );
        invitationsSent = result.sent;
        invitationsFailed = result.failed;
      }
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

    // Exports put a document header above the table; find the column row.
    const cellText = (value: ExcelJS.CellValue): string =>
      this.cellToString(value);
    const headerRowNumber = findHeaderRowNumber(
      sheet,
      (text) => Boolean(HEADER_ALIASES[this.normalizeHeader(text)]),
      cellText,
    );
    const headerRow = sheet.getRow(headerRowNumber);
    const columnMap = new Map<number, keyof ParsedImportRow>();

    headerRow.eachCell((cell, colNumber) => {
      const header = this.normalizeHeader(this.cellToString(cell.value));
      const field = HEADER_ALIASES[header];
      if (field) {
        columnMap.set(colNumber, field);
      }
    });

    const requiredFields: Array<keyof ParsedImportRow> = ['firstName'];
    const mappedFields = new Set(columnMap.values());
    for (const field of requiredFields) {
      if (!mappedFields.has(field)) {
        throw new BadRequestException(
          `Missing required column: ${field}. Download the template for the correct format.`,
        );
      }
    }

    const rows: ParsedImportRow[] = [];

    for (
      let rowNumber = headerRowNumber + 1;
      rowNumber <= sheet.rowCount;
      rowNumber += 1
    ) {
      const row = sheet.getRow(rowNumber);
      if (this.isRowEmpty(row) || isExportFooterRow(row, cellText)) {
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
        const cellValue = row.getCell(colNumber).value;
        const isDateField =
          field === 'dateOfBirth' ||
          field === 'employmentDate';
        const value = isDateField
          ? this.cellToDateString(cellValue).trim()
          : this.cellToString(cellValue).trim();

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
          case 'middleName':
            parsed.middleName = value || undefined;
            break;
          case 'chineseName':
            parsed.chineseName = value || undefined;
            break;
          case 'role':
            parsed.role = value;
            break;
          case 'phone':
            parsed.phone = value || undefined;
            break;
          case 'discipline':
            parsed.discipline = value || undefined;
            break;
          case 'gender':
            parsed.gender = value || undefined;
            break;
          case 'department':
            parsed.department = value || undefined;
            break;
          case 'position':
            parsed.position = value || undefined;
            break;
          case 'employeeId':
            parsed.employeeId = value || undefined;
            break;
          case 'nationality':
            parsed.nationality = value || undefined;
            break;
          case 'employeeType':
            parsed.employeeType = value || undefined;
            break;
          case 'addressCountry':
            parsed.addressCountry = value || undefined;
            break;
          case 'addressRegion':
            parsed.addressRegion = value || undefined;
            break;
          case 'addressCity':
            parsed.addressCity = value || undefined;
            break;
          case 'addressSubcity':
            parsed.addressSubcity = value || undefined;
            break;
          case 'addressWoreda':
            parsed.addressWoreda = value || undefined;
            break;
          case 'addressHouseNumber':
            parsed.addressHouseNumber = value || undefined;
            break;
          case 'dateOfBirth':
            parsed.dateOfBirth = value || undefined;
            break;
          case 'nationalId':
            parsed.nationalId = value || undefined;
            break;
          case 'tin':
            parsed.tin = value || undefined;
            break;
          case 'educationLevel':
            parsed.educationLevel = value || undefined;
            break;
          case 'fieldOfStudy':
            parsed.fieldOfStudy = value || undefined;
            break;
          case 'employmentDate':
            parsed.employmentDate = value || undefined;
            break;
          case 'yearsOfExperience':
            parsed.yearsOfExperience = value || undefined;
            break;
          case 'leavePolicy':
            parsed.leavePolicy = value || undefined;
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
    const lookups = await this.loadLookups(ctx.companyId);

    const emailsInFile = new Set<string>();
    const previewRows: ImportRowPreviewDto[] = [];

    for (const row of rows) {
      const preview = await this.validateRow(
        ctx,
        row,
        lookups,
        emailsInFile,
      );
      previewRows.push(preview);
      if (preview.status === 'ok' && preview.email) {
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
    lookups: ImportLookups,
    emailsInFile: Set<string>,
  ): Promise<ImportRowPreviewDto> {
    const base: ImportRowPreviewDto = {
      line: row.line,
      email: row.email.trim() || undefined,
      firstName: row.firstName,
      lastName: row.lastName,
      middleName: row.middleName,
      chineseName: row.chineseName,
      role: row.role,
      phone: row.phone,
      department: row.department,
      position: row.position,
      employeeId: row.employeeId,
      leavePolicy: row.leavePolicy,
      // Raw sheet values so the UI can edit invalid rows from the message
      gender: row.gender as ImportRowPreviewDto['gender'],
      nationality: row.nationality as ImportRowPreviewDto['nationality'],
      employeeType: row.employeeType as ImportRowPreviewDto['employeeType'],
      educationLevel: row.educationLevel as ImportRowPreviewDto['educationLevel'],
      dateOfBirth: row.dateOfBirth,
      employmentDate: row.employmentDate,
      yearsOfExperience: row.yearsOfExperience,
      discipline: row.discipline as ImportRowPreviewDto['discipline'],
      nationalId: row.nationalId,
      tin: row.tin,
      fieldOfStudy: row.fieldOfStudy,
      addressCountry: row.addressCountry,
      addressRegion: row.addressRegion,
      addressCity: row.addressCity,
      addressSubcity: row.addressSubcity,
      addressWoreda: row.addressWoreda,
      addressHouseNumber: row.addressHouseNumber,
      status: 'error',
    };

    if (!row.firstName.trim()) {
      return {
        ...base,
        status: 'error',
        message: 'firstName is required',
      };
    }

    if (row.tin && !TIN_PATTERN.test(row.tin.trim())) {
      return {
        ...base,
        status: 'error',
        message: 'tin must be exactly 10 digits',
      };
    }

    const genderResult = this.parseEnumField(
      row.gender,
      GENDER_VALUES,
      'gender',
    );
    if (!genderResult.ok) {
      return { ...base, status: 'error', message: genderResult.message };
    }

    const nationalityResult = this.parseEnumField(
      row.nationality,
      NATIONALITY_VALUES,
      'nationality',
    );
    if (!nationalityResult.ok) {
      return { ...base, status: 'error', message: nationalityResult.message };
    }

    const employeeTypeResult = this.parseEnumField(
      row.employeeType,
      EMPLOYEE_TYPE_VALUES,
      'employeeType',
    );
    if (!employeeTypeResult.ok) {
      return { ...base, status: 'error', message: employeeTypeResult.message };
    }

    const educationLevelResult = this.parseEnumField(
      row.educationLevel,
      EDUCATION_LEVEL_VALUES,
      'educationLevel',
    );
    if (!educationLevelResult.ok) {
      return { ...base, status: 'error', message: educationLevelResult.message };
    }

    const dateOfBirthResult = this.parseImportDate(
      row.dateOfBirth,
      'dateOfBirth',
    );
    if (!dateOfBirthResult.ok) {
      return { ...base, status: 'error', message: dateOfBirthResult.message };
    }

    const employmentDateResult = this.parseImportDate(
      row.employmentDate,
      'employmentDate',
    );
    if (!employmentDateResult.ok) {
      return {
        ...base,
        status: 'error',
        message: employmentDateResult.message,
      };
    }

    const yearsOfExperienceResult = this.parseImportYears(row.yearsOfExperience);
    if (!yearsOfExperienceResult.ok) {
      return {
        ...base,
        status: 'error',
        message: yearsOfExperienceResult.message,
      };
    }

    let discipline: UserDiscipline | null | undefined;
    let engineeringDisciplineId: string | undefined;
    if (row.discipline !== undefined) {
      const trimmedDiscipline = row.discipline.trim();
      if (trimmedDiscipline !== '') {
        const parsedDiscipline = parseUserDisciplineInput(row.discipline);
        const engineeringDiscipline =
          lookups.disciplineByNormalizedName.get(
            this.normalizeLookupKey(trimmedDiscipline),
          ) ?? undefined;
        if (parsedDiscipline === undefined && !engineeringDiscipline) {
          return {
            ...base,
            status: 'error',
            message: `Unknown discipline: ${row.discipline}`,
          };
        }
        discipline = parsedDiscipline ?? null;
        engineeringDisciplineId = engineeringDiscipline?.id;
      } else {
        discipline = null;
      }
    }

    let departmentId: string | undefined;
    if (row.department?.trim()) {
      const department = lookups.departmentByNormalizedName.get(
        this.normalizeLookupKey(row.department),
      );
      if (!department) {
        return {
          ...base,
          status: 'error',
          message: `Unknown department: ${row.department}`,
        };
      }
      departmentId = department.id;
    }

    let positionId: string | undefined;
    if (row.position?.trim()) {
      const position = this.resolvePosition(
        row.position,
        lookups.positionByNormalizedTitle,
      );
      if (!position) {
        return {
          ...base,
          status: 'error',
          message: `Unknown position: ${row.position}`,
        };
      }
      positionId = position.id;
    }

    let leavePolicyId: string | undefined;
    if (row.leavePolicy?.trim()) {
      const leavePolicy = lookups.leavePolicyByNormalizedName.get(
        this.normalizeLookupKey(row.leavePolicy),
      );
      if (!leavePolicy) {
        return {
          ...base,
          status: 'error',
          message: `Unknown leavePolicy: ${row.leavePolicy}`,
        };
      }
      leavePolicyId = leavePolicy.id;
    }

    let roleId: string | undefined;
    const roleName = row.role.trim();
    if (roleName) {
      const role = lookups.roleByNormalizedName.get(
        this.normalizeLookupKey(roleName),
      );
      if (!role) {
        return {
          ...base,
          status: 'error',
          message: `Unknown role: ${roleName}`,
        };
      }
      roleId = role.id;
    }

    const resolved: Partial<ImportRowPreviewDto> = {
      roleId,
      departmentId,
      positionId,
      leavePolicyId,
      engineeringDisciplineId,
      discipline: discipline ?? undefined,
      gender: genderResult.value,
      nationality: nationalityResult.value,
      employeeType: employeeTypeResult.value,
      educationLevel: educationLevelResult.value,
      dateOfBirth: dateOfBirthResult.value,
      employmentDate: employmentDateResult.value,
      yearsOfExperience: yearsOfExperienceResult.value,
    };

    const trimmedEmail = row.email.trim();
    if (!trimmedEmail) {
      return {
        ...base,
        status: 'ok',
        ...resolved,
        message: 'Record-only user (no login access)',
      };
    }

    if (!this.isValidEmail(trimmedEmail)) {
      return {
        ...base,
        email: trimmedEmail,
        status: 'error',
        message: 'Invalid email address',
      };
    }

    const normalizedEmail = normalizeEmail(trimmedEmail);

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

    if (existing?.deletedAt) {
      return {
        ...base,
        email: normalizedEmail,
        status: 'ok',
        ...resolved,
        message: 'Previously deleted user will be restored',
      };
    }

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

    return {
      ...base,
      email: normalizedEmail,
      status: 'ok',
      ...resolved,
    };
  }

  private async loadLookups(companyId: string): Promise<ImportLookups> {
    const [roles, departments, positions, leavePolicies, disciplines] =
      await Promise.all([
        this.prisma.role.findMany({
          where: activeOnly({ companyId }),
          select: { id: true, name: true },
          orderBy: { name: Prisma.SortOrder.asc },
        }),
        this.prisma.department.findMany({
          where: activeOnly({ companyId }),
          select: { id: true, name: true },
        }),
        this.prisma.position.findMany({
          where: activeOnly({ companyId }),
          select: { id: true, title: true, titleZh: true },
        }),
        this.prisma.leavePolicy.findMany({
          where: activeOnly({ companyId }),
          select: { id: true, name: true },
        }),
        this.prisma.discipline.findMany({
          where: activeOnly({ companyId }),
          select: { id: true, name: true, nameZh: true },
        }),
      ]);

    const roleByNormalizedName = new Map(
      roles.map((role) => [this.normalizeLookupKey(role.name), role]),
    );

    const departmentByNormalizedName = new Map(
      departments.map((department) => [
        this.normalizeLookupKey(department.name),
        { id: department.id, name: department.name },
      ]),
    );

    const positionByNormalizedTitle = new Map<string, NamedLookup>();
    for (const position of positions) {
      positionByNormalizedTitle.set(this.normalizeLookupKey(position.title), {
        id: position.id,
        name: position.title,
      });
      if (position.titleZh?.trim()) {
        positionByNormalizedTitle.set(
          this.normalizeLookupKey(position.titleZh),
          { id: position.id, name: position.title },
        );
      }
    }

    const leavePolicyByNormalizedName = new Map(
      leavePolicies.map((policy) => [
        this.normalizeLookupKey(policy.name),
        { id: policy.id, name: policy.name },
      ]),
    );

    const disciplineByNormalizedName = new Map<string, NamedLookup>();
    for (const discipline of disciplines) {
      disciplineByNormalizedName.set(this.normalizeLookupKey(discipline.name), {
        id: discipline.id,
        name: discipline.name,
      });
      if (discipline.nameZh?.trim()) {
        disciplineByNormalizedName.set(
          this.normalizeLookupKey(discipline.nameZh),
          { id: discipline.id, name: discipline.name },
        );
      }
    }

    return {
      roleByNormalizedName,
      departmentByNormalizedName,
      positionByNormalizedTitle,
      leavePolicyByNormalizedName,
      disciplineByNormalizedName,
    };
  }

  private parseEnumField<T extends string>(
    value: string | undefined,
    allowed: readonly T[],
    fieldLabel: string,
  ):
    | { ok: true; value: T | undefined }
    | { ok: false; message: string } {
    if (value === undefined || value.trim() === '') {
      return { ok: true, value: undefined };
    }
    const trimmed = value.trim();
    const upper = trimmed.toUpperCase().replace(/[\s-]+/g, '_');
    const compact = trimmed.toUpperCase().replace(/[\s_-]+/g, '');
    const match = allowed.find((entry) => {
      const entryCompact = entry.replace(/_/g, '');
      return entry === upper || entryCompact === compact;
    });
    if (!match) {
      return {
        ok: false,
        message: `Unknown ${fieldLabel}: ${value}`,
      };
    }
    return { ok: true, value: match };
  }

  private resolvePosition(
    rawLabel: string,
    catalog: Map<string, NamedLookup>,
  ): NamedLookup | undefined {
    const key = this.normalizeLookupKey(rawLabel);
    const direct = catalog.get(key);
    if (direct) {
      return direct;
    }
    const aliased = POSITION_ALIASES[key];
    if (aliased) {
      return catalog.get(this.normalizeLookupKey(aliased));
    }
    return undefined;
  }

  /** Years of experience: 0 to YEARS_OF_EXPERIENCE_MAX, at most one decimal. */
  private parseImportYears(
    value: string | undefined,
  ):
    | { ok: true; value: string | undefined }
    | { ok: false; message: string } {
    const trimmed = value?.trim() ?? '';
    if (!trimmed) {
      return { ok: true, value: undefined };
    }
    const normalised = trimmed.replace(',', '.');
    const years = Number(normalised);
    if (
      !/^\d+(\.\d)?$/.test(normalised) ||
      years > YEARS_OF_EXPERIENCE_MAX
    ) {
      return {
        ok: false,
        message: `yearsOfExperience must be a number from 0 to ${YEARS_OF_EXPERIENCE_MAX} with at most one decimal`,
      };
    }
    return { ok: true, value: String(years) };
  }

  private parseImportDate(
    value: string | undefined,
    fieldLabel: string,
  ):
    | { ok: true; value: string | undefined }
    | { ok: false; message: string } {
    if (value === undefined || value.trim() === '') {
      return { ok: true, value: undefined };
    }
    const trimmed = value.trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
    if (iso) {
      return { ok: true, value: `${iso[1]}-${iso[2]}-${iso[3]}` };
    }
    // DD/MM/YYYY or D/M/YYYY (Ethiopian/EU sheet style)
    const dmy = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(trimmed);
    if (dmy) {
      const day = Number(dmy[1]);
      const month = Number(dmy[2]);
      const year = Number(dmy[3]);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        return {
          ok: true,
          value: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        };
      }
    }
    // Excel serial date as plain number string
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      const serial = Number(trimmed);
      if (serial > 20000 && serial < 80000) {
        const excelEpoch = Date.UTC(1899, 11, 30);
        const ms = excelEpoch + Math.floor(serial) * 24 * 60 * 60 * 1000;
        const date = new Date(ms);
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return { ok: true, value: `${year}-${month}-${day}` };
      }
    }
    return {
      ok: false,
      message: `Invalid ${fieldLabel}: use YYYY-MM-DD or DD/MM/YYYY`,
    };
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

  private normalizeLookupKey(value: string): string {
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
    if (typeof value === 'number' && Number.isFinite(value)) {
      // Excel serial day count (1900 date system)
      const excelEpoch = Date.UTC(1899, 11, 30);
      const ms = excelEpoch + Math.floor(value) * 24 * 60 * 60 * 1000;
      const date = new Date(ms);
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
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

  private formatImportError(error: unknown): string {
    if (error instanceof ConflictException) {
      return error.message;
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return 'Email already exists for this company';
    }

    return error instanceof Error ? error.message : 'Failed to create user';
  }
}
