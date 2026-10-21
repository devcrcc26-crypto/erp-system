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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentCompany } from '../../../shared/decorators/current-company.decorator';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import { DelegatePermissionCheck } from '../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionsGuard } from '../../../shared/permissions/permissions.guard';
import { RequireAnyPermission } from '../../../shared/permissions/require-any-permission.decorator';
import { AuthenticatedUser } from '../../../shared/types/jwt-payload.type';
import {
  CreateAssetRequestDto,
  FulfillAssetRequestDto,
  ListAssetRequestsDto,
  UpdateAssetRequestDto,
} from '../application/dtos/asset-request.dtos';
import { AssetRequestService } from '../application/services/asset-request.service';

async function parseDto<T extends object>(
  cls: new () => T,
  body: Record<string, unknown>,
): Promise<T> {
  const dto = plainToInstance(cls, body);
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  if (errors.length > 0) {
    throw new BadRequestException({
      message: 'Validation failed',
      details: errors.map((e) => ({ property: e.property, constraints: e.constraints })),
    });
  }
  return dto;
}

@ApiTags('HR Asset Requests')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission(
  { module: 'company-asset', action: 'view' },
  { module: 'company-asset', action: 'manage' },
)
@Controller('hr/asset-requests')
export class AssetRequestController {
  constructor(private readonly assetRequestService: AssetRequestService) {}

  @Post()
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Create a draft asset request' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    const dto = await parseDto(CreateAssetRequestDto, body);
    return this.assetRequestService.createDraft(dto, companyId, user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'List asset requests' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: ListAssetRequestsDto,
  ): Promise<unknown> {
    return this.assetRequestService.listRequests(query, companyId, user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single asset request' })
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.assetRequestService.getRequest(id, companyId, user.userId);
  }

  @Patch(':id')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Update a draft or returned asset request' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    const dto = await parseDto(UpdateAssetRequestDto, body);
    return this.assetRequestService.updateDraft(id, dto, companyId, user.userId);
  }

  @Post(':id/submit')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Submit a draft asset request for approval' })
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.assetRequestService.submitRequest(id, companyId, user.userId);
  }

  @Patch(':id/cancel')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Cancel a draft or submitted asset request' })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.assetRequestService.cancelRequest(id, companyId, user.userId);
  }

  @Post(':id/fulfill')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Fulfil an approved asset request (HR only)' })
  async fulfill(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    const dto = await parseDto(FulfillAssetRequestDto, body);
    return this.assetRequestService.fulfillRequest(id, dto, companyId, user.userId);
  }
}
