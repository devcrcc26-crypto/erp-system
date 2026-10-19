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
import { canManageFlightImport } from '../../application/utils/flight-import-access.util';
import { ImportCommitResponseDto } from '../../../hr-shared/application/dtos/hr-import.dtos';
import { FlightImportPreviewResponseDto } from '../../application/dtos/flight-import.dtos';
import { FlightImportService } from '../../application/services/flight-import.service';

@ApiTags('HR Flight Application Import')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission({ module: 'flight', action: 'manage' })
@Controller('hr/flight-applications/import')
export class FlightImportController {
  constructor(
    private readonly flightImportService: FlightImportService,
    private readonly permissionService: PermissionService,
  ) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  private async assertCanManageFlightImport(user: AuthenticatedUser): Promise<void> {
    const roleNames = await this.permissionService.getUserRoleNames(
      user.userId,
      user.companyId,
    );
    if (!canManageFlightImport(roleNames)) {
      throw new ForbiddenException(
        'Only HR management roles can manage flight application imports',
      );
    }
  }

  @Get('template')
  @ApiOperation({
    summary:
      'Download flight application passengers import Excel template (company-wide)',
  })
  async downloadTemplate(): Promise<StreamableFile> {
    const buffer = await this.flightImportService.buildCompanyTemplate();
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition:
        'attachment; filename="flight-application-import-template.xlsx"',
    });
  }

  @Post('preview')
  @ApiOperation({
    summary: 'Validate a flight application import file without writing',
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
  ): Promise<FlightImportPreviewResponseDto> {
    await this.assertCanManageFlightImport(user);
    return this.flightImportService.previewCompanyImport(this.ctx(user), file);
  }

  @Post()
  @ApiOperation({
    summary:
      'Import flight passengers from Excel into DRAFT applications (no auto-submit)',
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
    await this.assertCanManageFlightImport(user);
    return this.flightImportService.commitCompanyImport(this.ctx(user), file);
  }
}
