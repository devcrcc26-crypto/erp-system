import {
  Controller,
  ForbiddenException,
  Get,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequireAnyPermission } from '../../../../shared/permissions/require-any-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import { ImportCommitResponseDto } from '../../../hr-shared/application/dtos/hr-import.dtos';
import { LeaveBalanceImportPreviewResponseDto } from '../../application/dtos/leave-balance-import.dtos';
import { LeaveBalanceImportService } from '../../application/services/leave-balance-import.service';
import { canEditLeaveBalances } from '../../application/utils/leave-balance-access.util';

@ApiTags('HR Leave Balance Import')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission({ module: 'leave', action: 'manage' })
@Controller('hr/leave-balances/import')
export class LeaveBalanceImportController {
  constructor(
    private readonly leaveBalanceImportService: LeaveBalanceImportService,
    private readonly permissionService: PermissionService,
  ) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  private async assertCanEditLeaveBalances(
    user: AuthenticatedUser,
  ): Promise<void> {
    const roleNames = await this.permissionService.getUserRoleNames(
      user.userId,
      user.companyId,
    );
    if (!canEditLeaveBalances(roleNames)) {
      throw new ForbiddenException(
        'Only System Administrator, General Manager, or HR can edit leave balances',
      );
    }
  }

  @Get('template')
  @ApiOperation({ summary: 'Download leave balance import Excel template' })
  async downloadTemplate(): Promise<StreamableFile> {
    const buffer = await this.leaveBalanceImportService.buildTemplate();
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="leave-balance-import-template.xlsx"',
    });
  }

  @Post('preview')
  @ApiOperation({
    summary: 'Validate a leave balance import file without writing',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async preview(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<LeaveBalanceImportPreviewResponseDto> {
    await this.assertCanEditLeaveBalances(user);
    return this.leaveBalanceImportService.previewImport(this.ctx(user), file);
  }

  @Post()
  @ApiOperation({
    summary: 'Import leave balance entitlements from Excel (upsert)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async import(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ImportCommitResponseDto> {
    await this.assertCanEditLeaveBalances(user);
    return this.leaveBalanceImportService.commitImport(this.ctx(user), file);
  }
}
