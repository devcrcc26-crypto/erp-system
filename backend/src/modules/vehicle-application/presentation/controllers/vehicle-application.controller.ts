import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentCompany } from '../../../../shared/decorators/current-company.decorator';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { DelegatePermissionCheck } from '../../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { assertPermissionOrSupervisor } from '../../../../shared/org/team-scope.util';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequireAnyPermission } from '../../../../shared/permissions/require-any-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  ListVehicleApplicationsDto,
  SubmitVehicleApplicationDto,
  UpdateVehicleApplicationDto,
} from '../../application/dtos/vehicle-application.dtos';
import { VehicleApplicationService } from '../../application/services/vehicle-application.service';
import { VehicleApplicationPdfService } from '../../application/services/vehicle-application-pdf.service';

async function parseDto<T extends object>(
  cls: new () => T,
  body: Record<string, unknown>,
): Promise<T> {
  const dto = plainToInstance(cls, body);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length > 0) {
    throw new BadRequestException({
      message: 'Validation failed',
      details: errors.map((error) => ({
        property: error.property,
        constraints: error.constraints,
      })),
    });
  }
  return dto;
}

@ApiTags('HR Vehicle Applications')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission(
  { module: 'vehicle-application', action: 'view' },
  { module: 'vehicle-application', action: 'create' },
)
@Controller('hr/vehicle-applications')
export class VehicleApplicationController {
  constructor(
    private readonly vehicleApplicationService: VehicleApplicationService,
    private readonly vehicleApplicationPdfService: VehicleApplicationPdfService,
    private readonly permissionService: PermissionService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      'Submit a vehicle application (create + submit in one call; direct APPROVED for HR+)',
  })
  async submit(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    const dto = await parseDto(SubmitVehicleApplicationDto, body);
    return this.vehicleApplicationService.submitApplication(
      dto,
      companyId,
      user.userId,
    );
  }

  @Get()
  // Module permission, or a supervisor viewing their team's records.
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      'List vehicle applications (company-wide for hr.view; own otherwise)',
  })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: ListVehicleApplicationsDto,
  ): Promise<unknown> {
    await assertPermissionOrSupervisor(
      this.permissionService,
      this.prisma,
      user.userId,
      companyId,
      [
        { module: 'vehicle-application', action: 'view' },
        { module: 'vehicle-application', action: 'create' },
      ],
    );
    return this.vehicleApplicationService.listApplications(
      query,
      companyId,
      user.userId,
    );
  }

  @Get(':id')
  // Module permission, or a supervisor viewing their team's records.
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'Get a vehicle application with vehicle and approval tiers',
  })
  async getOne(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    await assertPermissionOrSupervisor(
      this.permissionService,
      this.prisma,
      user.userId,
      companyId,
      [
        { module: 'vehicle-application', action: 'view' },
        { module: 'vehicle-application', action: 'create' },
      ],
    );
    return this.vehicleApplicationService.getApplication(
      id,
      companyId,
      user.userId,
    );
  }

  @Patch(':id')
  // Ownership and DRAFT/RETURNED status are enforced in the service.
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      'Edit your own draft or returned vehicle application (saves only; resubmit from Approvals)',
  })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    const dto = await parseDto(UpdateVehicleApplicationDto, body);
    return this.vehicleApplicationService.updateApplication(
      id,
      dto,
      companyId,
      user.userId,
    );
  }

  @Patch(':id/cancel')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'Cancel a draft or submitted vehicle application (owner only)',
  })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.vehicleApplicationService.cancelApplication(
      id,
      companyId,
      user.userId,
    );
  }

  @Post(':id/release')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      'Release vehicle after use - sets releasedAt/By, vehicle → AVAILABLE',
  })
  release(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.vehicleApplicationService.releaseVehicle(
      id,
      companyId,
      user.userId,
    );
  }

  @Get(':id/pdf')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Download vehicle application as PDF' })
  @ApiProduces('application/pdf')
  async downloadPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
  ): Promise<StreamableFile> {
    await assertPermissionOrSupervisor(
      this.permissionService,
      this.prisma,
      user.userId,
      companyId,
      [
        { module: 'vehicle-application', action: 'view' },
        { module: 'vehicle-application', action: 'create' },
      ],
    );
    // Same visibility as the detail page (owner, approver, team, or manager).
    await this.vehicleApplicationService.getApplication(id, companyId, user.userId);
    const file = await this.vehicleApplicationPdfService.getPdf(id, companyId);
    return new StreamableFile(file.buffer, {
      type: file.mimeType,
      disposition: contentDisposition('inline', file.filename),
    });
  }
}

function contentDisposition(kind: 'inline' | 'attachment', filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
