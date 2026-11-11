import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ApiBearerAuth,
  ApiConsumes,
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
  AvailableVehiclesQueryDto,
  CreateCompanyVehicleDto,
  ListCompanyVehiclesDto,
  UpdateCompanyVehicleDto,
  UpdateCompanyVehicleStatusDto,
} from '../../application/dtos/company-vehicle.dtos';
import { CompanyVehicleService } from '../../application/services/company-vehicle.service';

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

@ApiTags('Organization Vehicles')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission(
  { module: 'vehicles', action: 'view' },
)
@Controller('organization/vehicles')
export class CompanyVehicleController {
  constructor(
    private readonly companyVehicleService: CompanyVehicleService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List company vehicles with search/filter' })
  list(
    @CurrentCompany() companyId: string,
    @Query() query: ListCompanyVehiclesDto,
  ): Promise<unknown> {
    return this.companyVehicleService.listVehicles(query, companyId);
  }

  @Post()
  @DelegatePermissionCheck()
  @RequireAnyPermission(
    { module: 'vehicles', action: 'edit' },
  )
  @ApiOperation({ summary: 'Create a new company vehicle' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    const dto = await parseDto(CreateCompanyVehicleDto, body);
    return this.companyVehicleService.createVehicle(dto, companyId, user.userId);
  }

  @Get('available')
  @ApiOperation({
    summary: 'Get vehicles with availability for a time range',
  })
  getAvailable(
    @CurrentCompany() companyId: string,
    @Query() query: AvailableVehiclesQueryDto,
  ): Promise<unknown> {
    return this.companyVehicleService.getAvailableVehicles(query, companyId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single vehicle' })
  getOne(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.companyVehicleService.getVehicle(id, companyId);
  }

  @Patch(':id')
  @DelegatePermissionCheck()
  @RequireAnyPermission(
    { module: 'vehicles', action: 'edit' },
  )
  @ApiOperation({ summary: 'Update vehicle details' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    const dto = await parseDto(UpdateCompanyVehicleDto, body);
    return this.companyVehicleService.updateVehicle(
      id,
      dto,
      companyId,
      user.userId,
    );
  }

  @Patch(':id/status')
  @DelegatePermissionCheck()
  @RequireAnyPermission(
    { module: 'vehicles', action: 'edit' },
  )
  @ApiOperation({ summary: 'Update vehicle status' })
  async updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    const dto = await parseDto(UpdateCompanyVehicleStatusDto, body);
    return this.companyVehicleService.updateVehicleStatus(
      id,
      dto.status,
      companyId,
      user.userId,
    );
  }

  @Delete(':id')
  @DelegatePermissionCheck()
  @RequireAnyPermission(
    { module: 'vehicles', action: 'edit' },
  )
  @ApiOperation({ summary: 'Soft-delete a vehicle' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    await this.companyVehicleService.deleteVehicle(id, companyId, user.userId);
    return { success: true };
  }

  @Get(':id/photo/download-url')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'Presigned download URL for a vehicle photo (HR/vehicles viewers)',
  })
  getPhotoDownloadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<{ url: string; expiresIn: number }> {
    return this.companyVehicleService.getVehiclePhotoDownloadUrl(
      id,
      companyId,
      user.userId,
    );
  }

  @Post(':id/photo')
  @DelegatePermissionCheck()
  @RequireAnyPermission(
    { module: 'vehicles', action: 'edit' },
  )
  @ApiOperation({ summary: 'Upload a photo for a vehicle' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async uploadPhoto(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<unknown> {
    if (!file) {
      throw new BadRequestException('Photo file is required');
    }

    void body;

    return this.companyVehicleService.uploadVehiclePhoto(
      id,
      {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        buffer: file.buffer,
      },
      companyId,
      user.userId,
    );
  }

  @Delete(':id/photo')
  @DelegatePermissionCheck()
  @RequireAnyPermission(
    { module: 'vehicles', action: 'edit' },
  )
  @ApiOperation({ summary: 'Remove a vehicle photo' })
  async deletePhoto(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.companyVehicleService.deleteVehiclePhoto(
      id,
      companyId,
      user.userId,
    );
  }
}
