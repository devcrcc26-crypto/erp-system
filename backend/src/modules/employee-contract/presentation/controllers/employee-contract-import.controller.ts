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
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequireAnyPermission } from '../../../../shared/permissions/require-any-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { ImportCommitResponseDto } from '../../../hr-shared/application/dtos/hr-import.dtos';
import { EmployeeContractImportPreviewResponseDto } from '../../application/dtos/employee-contract-import.dtos';
import { EmployeeContractImportService } from '../../application/services/employee-contract-import.service';
import { canManageContractImport } from '../../application/utils/employee-contract-import-access.util';

@ApiTags('HR Employee Contract Import')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission({ module: 'employee-contract', action: 'create' })
@Controller('hr/employee-contracts/import')
export class EmployeeContractImportController {
  constructor(
    private readonly employeeContractImportService: EmployeeContractImportService,
    private readonly permissionService: PermissionService,
  ) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  private async assertCanManageContractImport(
    user: AuthenticatedUser,
  ): Promise<void> {
    const roleNames = await this.permissionService.getUserRoleNames(
      user.userId,
      user.companyId,
    );
    if (!canManageContractImport(roleNames)) {
      throw new ForbiddenException(
        'Only HR management roles can manage employee contract imports',
      );
    }
  }

  @Get('template')
  @ApiOperation({ summary: 'Download employee contract import Excel template' })
  async downloadTemplate(): Promise<StreamableFile> {
    const buffer = await this.employeeContractImportService.buildTemplate();
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="employee-contract-import-template.xlsx"',
    });
  }

  @Post('preview')
  @ApiOperation({
    summary: 'Validate an employee contract import file without creating rows',
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
  ): Promise<EmployeeContractImportPreviewResponseDto> {
    await this.assertCanManageContractImport(user);
    return this.employeeContractImportService.previewImport(this.ctx(user), file);
  }

  @Post()
  @ApiOperation({ summary: 'Import employee contracts from an Excel file' })
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
    await this.assertCanManageContractImport(user);
    return this.employeeContractImportService.commitImport(this.ctx(user), file);
  }
}
