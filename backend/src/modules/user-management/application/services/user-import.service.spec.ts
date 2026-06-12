import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { UserImportService } from './user-import.service';
import { UserInvitationDispatchService } from './user-invitation-dispatch.service';
import { UserManagementService } from './user-management.service';
import { UserProvisioningService } from './user-provisioning.service';

describe('UserImportService', () => {
  let service: UserImportService;
  let prisma: {
    role: { findMany: jest.Mock };
  };
  let userProvisioningService: jest.Mocked<
    Pick<
      UserProvisioningService,
      'findExistingUserByEmail' | 'provisionInvitedUser'
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
    };
    userProvisioningService = {
      findExistingUserByEmail: jest.fn().mockResolvedValue(null),
      provisionInvitedUser: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'new@test.local',
        firstName: 'Jane',
        lastName: 'Doe',
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
    sheet.addRow(['email', 'firstName', 'lastName', 'role', 'phone']);
    for (const row of rows) {
      sheet.addRow([
        row.email,
        row.firstName,
        row.lastName,
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

  it('rejects files without required columns', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Users');
    sheet.addRow(['email', 'firstName']);
    sheet.addRow(['only@test.local', 'Jane']);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    await expect(
      service.previewImport(ctx, buildFile(buffer)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
