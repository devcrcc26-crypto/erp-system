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
import { LeaveRequestImportPreviewResponseDto } from '../../application/dtos/leave-request-import.dtos';
import { LeaveRequestImportService } from '../../application/services/leave-request-import.service';
import { canEditLeaveRequests } from '../../application/utils/leave-request-access.util';

@ApiTags('HR Leave Request Import')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission({ module: 'leave', action: 'manage' })
@Controller('hr/leave-requests/import')
export class LeaveRequestImportController {
  constructor(
    private readonly leaveRequestImportService: LeaveRequestImportService,
    private readonly permissionService: PermissionService,
  ) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  private async assertCanEditLeaveRequests(
    user: AuthenticatedUser,
  ): Promise<void> {
    const roleNames = await this.permissionService.getUserRoleNames(
      user.userId,
      user.companyId,
    );
    if (!canEditLeaveRequests(roleNames)) {
      throw new ForbiddenException(
        'Only System Administrator, General Manager, Managing Director, or HR can import leave requests',
      );
    }
  }

  @Get('template')
  @ApiOperation({ summary: 'Download leave request import Excel template' })
  async downloadTemplate(): Promise<StreamableFile> {
    const buffer = await this.leaveRequestImportService.buildTemplate();
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="leave-request-import-template.xlsx"',
    });
  }

  @Post('preview')
  @ApiOperation({
    summary: 'Validate a leave request import file without submitting',
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
  ): Promise<LeaveRequestImportPreviewResponseDto> {
    await this.assertCanEditLeaveRequests(user);
    return this.leaveRequestImportService.previewImport(this.ctx(user), file);
  }

  @Post()
  @ApiOperation({
    summary: 'Import leave requests from Excel (submit on behalf of employees)',
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
    await this.assertCanEditLeaveRequests(user);
    return this.leaveRequestImportService.commitImport(this.ctx(user), file);
  }
}
