import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { UserImportService } from './user-import.service';
import { UserInvitationDispatchService } from './user-invitation-dispatch.service';
import { UserManagementService } from './user-management.service';
import { UserProvisioningService } from './user-provisioning.service';

describe('UserImportService', () => {
  jest.setTimeout(30_000);
  let service: UserImportService;
  let prisma: {
    role: { findMany: jest.Mock };
    department: { findMany: jest.Mock };
    position: { findMany: jest.Mock };
    leavePolicy: { findMany: jest.Mock };
    discipline: { findMany: jest.Mock };
  };
  let userProvisioningService: jest.Mocked<
    Pick<
      UserProvisioningService,
      | 'findExistingUserByEmail'
      | 'provisionInvitedUser'
      | 'provisionRecordOnlyUser'
    >
  >;
  let userManagementService: jest.Mocked<
    Pick<UserManagementService, 'assignUserRole'>
  >;
  let userInvitationDispatchService: jest.Mocked<
    Pick<UserInvitationDispatchService, 'dispatchInvitations'>
  >;

  const ctx = { companyId: 'company-1', userId: 'admin-1' };

  beforeEach(() => {
    prisma = {
      role: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'role-employee', name: 'Employee' },
          { id: 'role-admin', name: 'System Administrator' },
        ]),
      },
      department: { findMany: jest.fn().mockResolvedValue([]) },
      position: { findMany: jest.fn().mockResolvedValue([]) },
      leavePolicy: { findMany: jest.fn().mockResolvedValue([]) },
      discipline: { findMany: jest.fn().mockResolvedValue([]) },
    };
    userProvisioningService = {
      findExistingUserByEmail: jest.fn().mockResolvedValue(null),
      provisionInvitedUser: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'new@test.local',
        firstName: 'Jane',
        lastName: 'Doe',
      }),
      provisionRecordOnlyUser: jest.fn().mockResolvedValue({
        id: 'user-2',
        email: null,
        firstName: 'Wei',
        lastName: 'Zhang',
      }),
    };
    userManagementService = {
      assignUserRole: jest.fn().mockResolvedValue(undefined),
    };
    userInvitationDispatchService = {
      dispatchInvitations: jest.fn().mockResolvedValue({ sent: 1, failed: 0 }),
    };

    service = new UserImportService(
      prisma as never,
      userProvisioningService as unknown as UserProvisioningService,
      userInvitationDispatchService as unknown as UserInvitationDispatchService,
      userManagementService as unknown as UserManagementService,
    );
  });

  async function buildWorkbookBuffer(
    rows: Array<Record<string, string>>,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Users');
    sheet.addRow([
      'email',
      'firstName',
      'lastName',
      'chineseName',
      'role',
      'phone',
    ]);
    for (const row of rows) {
      sheet.addRow([
        row.email ?? '',
        row.firstName,
        row.lastName,
        row.chineseName ?? '',
        row.role,
        row.phone ?? '',
      ]);
    }
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  function buildFile(buffer: Buffer): Express.Multer.File {
    return {
      fieldname: 'file',
      originalname: 'users.xlsx',
      encoding: '7bit',
      mimetype:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: buffer.length,
      buffer,
      destination: '',
      filename: 'users.xlsx',
      path: '',
      stream: null as never,
    };
  }

  it('accepts yearsOfExperience with one decimal (comma or point)', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Users');
    sheet.addRow([
      'email',
      'firstName',
      'lastName',
      'role',
      'yearsOfExperience',
      'gender',
      'position',
    ]);
    sheet.addRow([
      '',
      'Abebe',
      'Gereme',
      'Employee',
      '6,5',
      'Male',
      'Structure Eng.',
    ]);
    prisma.position.findMany.mockResolvedValue([
      { id: 'pos-struct', title: 'Structural Engineer' },
    ]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const result = await service.previewImport(ctx, buildFile(buffer));

    expect(result.valid).toBe(1);
    expect(result.rows[0]).toMatchObject({
      status: 'ok',
      yearsOfExperience: '6.5',
      gender: 'MALE',
      positionId: 'pos-struct',
    });
  });

  it('returns preview rows for valid data', async () => {
    const file = buildFile(
      await buildWorkbookBuffer([
        {
          email: 'jane@test.local',
          firstName: 'Jane',
          lastName: 'Doe',
          role: 'Employee',
        },
      ]),
    );

    const result = await service.previewImport(ctx, file);

    expect(result.valid).toBe(1);
    expect(result.rows[0]).toMatchObject({
      line: 2,
      email: 'jane@test.local',
      status: 'ok',
      roleId: 'role-employee',
    });
  });

  it('flags unknown roles in preview', async () => {
    const file = buildFile(
      await buildWorkbookBuffer([
        {
          email: 'jane@test.local',
          firstName: 'Jane',
          lastName: 'Doe',
          role: 'Unknown Role',
        },
      ]),
    );

    const result = await service.previewImport(ctx, file);

    expect(result.valid).toBe(0);
    expect(result.rows[0].status).toBe('error');
    expect(result.rows[0].message).toContain('Unknown role');
  });

  it('allows restoring previously deleted users in preview', async () => {
    userProvisioningService.findExistingUserByEmail.mockResolvedValue({
      id: 'deleted-user',
      emailVerifiedAt: new Date('2026-01-01'),
      deletedAt: new Date('2026-06-01'),
    });

    const file = buildFile(
      await buildWorkbookBuffer([
        {
          email: 'restored@test.local',
          firstName: 'Restored',
          lastName: 'User',
          role: 'Employee',
        },
      ]),
    );

    const result = await service.previewImport(ctx, file);

    expect(result.valid).toBe(1);
    expect(result.rows[0]).toMatchObject({
      status: 'ok',
      message: 'Previously deleted user will be restored',
    });
  });

  it('flags duplicate emails in the file', async () => {
    const file = buildFile(
      await buildWorkbookBuffer([
        {
          email: 'dup@test.local',
          firstName: 'Jane',
          lastName: 'Doe',
          role: 'Employee',
        },
        {
          email: 'dup@test.local',
          firstName: 'John',
          lastName: 'Smith',
          role: 'Employee',
        },
      ]),
    );

    const result = await service.previewImport(ctx, file);

    expect(result.duplicate).toBe(1);
    expect(result.rows[1].status).toBe('duplicate_in_file');
  });

  it('commits valid rows and dispatches invitations', async () => {
    const file = buildFile(
      await buildWorkbookBuffer([
        {
          email: 'new@test.local',
          firstName: 'Jane',
          lastName: 'Doe',
          role: 'Employee',
        },
      ]),
    );

    const result = await service.commitImport(ctx, file, true);

    expect(result.created).toBe(1);
    expect(userProvisioningService.provisionInvitedUser).toHaveBeenCalled();
    expect(userManagementService.assignUserRole).toHaveBeenCalledWith(
      ctx,
      'user-1',
      { roleId: 'role-employee' },
    );
    expect(userInvitationDispatchService.dispatchInvitations).toHaveBeenCalled();
    expect(result.invitationsSent).toBe(1);
  });

  it('creates record-only users when email is blank', async () => {
    const file = buildFile(
      await buildWorkbookBuffer([
        {
          email: '',
          firstName: 'Wei',
          lastName: 'Zhang',
          chineseName: '张伟',
          role: 'Employee',
        },
      ]),
    );

    const preview = await service.previewImport(ctx, file);
    expect(preview.valid).toBe(1);
    expect(preview.rows[0]).toMatchObject({
      status: 'ok',
      chineseName: '张伟',
      message: 'Record-only user (no login access)',
    });

    const result = await service.commitImport(ctx, file, true);
    expect(result.created).toBe(1);
    expect(userProvisioningService.provisionRecordOnlyUser).toHaveBeenCalled();
    expect(userProvisioningService.provisionInvitedUser).not.toHaveBeenCalled();
    expect(
      userInvitationDispatchService.dispatchInvitations,
    ).not.toHaveBeenCalled();
    expect(result.invitationsSent).toBe(0);
  });

  it('accepts rows without a role', async () => {
    const file = buildFile(
      await buildWorkbookBuffer([
        {
          email: '',
          firstName: 'Li',
          lastName: 'Ming',
          chineseName: '李明',
          role: '',
        },
      ]),
    );

    const preview = await service.previewImport(ctx, file);
    expect(preview.valid).toBe(1);
    expect(preview.rows[0]).toMatchObject({
      status: 'ok',
      role: '',
      message: 'Record-only user (no login access)',
    });
    expect(preview.rows[0].roleId).toBeUndefined();

    const result = await service.commitImport(ctx, file, false);
    expect(result.created).toBe(1);
    expect(userManagementService.assignUserRole).not.toHaveBeenCalled();
  });

  it('accepts spreadsheets without a role column', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Users');
    sheet.addRow(['email', 'firstName', 'lastName', 'chineseName']);
    sheet.addRow(['', 'Li', 'Ming', '李明']);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const file = buildFile(buffer);

    const preview = await service.previewImport(ctx, file);
    expect(preview.valid).toBe(1);
    expect(preview.rows[0].role).toBe('');
    expect(preview.rows[0].roleId).toBeUndefined();
  });

  it('rejects files without required columns', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Users');
    sheet.addRow(['email', 'lastName']);
    sheet.addRow(['only@test.local', 'Doe']);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    await expect(
      service.previewImport(ctx, buildFile(buffer)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts rows with blank lastName', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Users');
    sheet.addRow(['email', 'firstName', 'lastName', 'role']);
    sheet.addRow(['', 'Abebe', '', 'Employee']);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const preview = await service.previewImport(ctx, buildFile(buffer));
    expect(preview.valid).toBe(1);
    expect(preview.rows[0]).toMatchObject({
      status: 'ok',
      firstName: 'Abebe',
      lastName: '',
    });
  });
});
