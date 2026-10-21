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
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentCompany } from '../../../../shared/decorators/current-company.decorator';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { DelegatePermissionCheck } from '../../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequireAnyPermission } from '../../../../shared/permissions/require-any-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  ListVehicleRefuelingsDto,
  SubmitVehicleRefuelingDto,
} from '../../application/dtos/vehicle-refueling.dtos';
import { VehicleRefuelingService } from '../../application/services/vehicle-refueling.service';
import { VehicleRefuelingPdfService } from '../../application/services/vehicle-refueling-pdf.service';

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

@ApiTags('HR Vehicle Refueling')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission(
  { module: 'vehicle-refueling', action: 'view' },
  { module: 'vehicle-refueling', action: 'create' },
)
@Controller('hr/vehicle-refueling')
export class VehicleRefuelingController {
  constructor(
    private readonly vehicleRefuelingService: VehicleRefuelingService,
    private readonly vehicleRefuelingPdfService: VehicleRefuelingPdfService,
  ) {}

  @Post()
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      'Submit a vehicle refueling request (create + submit; direct APPROVED for HR+)',
  })
  async submit(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    const dto = await parseDto(SubmitVehicleRefuelingDto, body);
    return this.vehicleRefuelingService.submitRequest(
      dto,
      companyId,
      user.userId,
    );
  }

  @Get()
  @ApiOperation({
    summary:
      'List vehicle refueling requests (company-wide for hr.view; own otherwise)',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: ListVehicleRefuelingsDto,
  ): Promise<unknown> {
    return this.vehicleRefuelingService.listRefuelings(
      query,
      companyId,
      user.userId,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a refueling request with vehicle and approval tiers',
  })
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.vehicleRefuelingService.getRefueling(
      id,
      companyId,
      user.userId,
    );
  }

  @Patch(':id/cancel')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'Cancel a draft or submitted refueling request (owner only)',
  })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.vehicleRefuelingService.cancelRefueling(
      id,
      companyId,
      user.userId,
    );
  }

  @Post(':id/receipt')
  @DelegatePermissionCheck()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  @ApiOperation({
    summary:
      'Attach a receipt document to an approved refueling request (multipart)',
  })
  async attachReceipt(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<unknown> {
    if (!file) {
      throw new BadRequestException('Receipt file is required');
    }
    return this.vehicleRefuelingService.attachReceipt(
      id,
      companyId,
      user.userId,
      {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        buffer: file.buffer,
      },
    );
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Download vehicle refueling request as PDF' })
  @ApiProduces('application/pdf')
  async downloadPdf(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
  ): Promise<StreamableFile> {
    const file = await this.vehicleRefuelingPdfService.getPdf(id, companyId);
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
