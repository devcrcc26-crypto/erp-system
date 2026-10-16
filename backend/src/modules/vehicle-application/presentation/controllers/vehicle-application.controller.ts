import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentCompany } from '../../../../shared/decorators/current-company.decorator';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { DelegatePermissionCheck } from '../../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequireAnyPermission } from '../../../../shared/permissions/require-any-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  ListVehicleApplicationsDto,
  SubmitVehicleApplicationDto,
} from '../../application/dtos/vehicle-application.dtos';
import { VehicleApplicationService } from '../../application/services/vehicle-application.service';

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
  { module: 'hr', action: 'view' },
  { module: 'vehicle-application', action: 'view' },
  { module: 'vehicle-application', action: 'create' },
)
@Controller('hr/vehicle-applications')
export class VehicleApplicationController {
  constructor(
    private readonly vehicleApplicationService: VehicleApplicationService,
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
  @ApiOperation({
    summary:
      'List vehicle applications (company-wide for hr.view; own otherwise)',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: ListVehicleApplicationsDto,
  ): Promise<unknown> {
    return this.vehicleApplicationService.listApplications(
      query,
      companyId,
      user.userId,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a vehicle application with vehicle and approval tiers',
  })
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.vehicleApplicationService.getApplication(
      id,
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
}
