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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiBody,
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
  AddMaterialRequisitionItemDto,
  CreateMaterialRequisitionDto,
  ListMaterialRequisitionsDto,
  UpdateMaterialRequisitionDto,
  UpdateMaterialRequisitionItemDto,
} from '../../application/dtos/material-requisition.dtos';
import { MaterialRequisitionService } from '../../application/services/material-requisition.service';

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

@ApiTags('HR Material Requisitions')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission(
  { module: 'hr', action: 'view' },
  { module: 'material-requisition', action: 'view' },
  { module: 'material-requisition', action: 'create' },
)
@Controller('hr/material-requisition')
export class MaterialRequisitionController {
  constructor(
    private readonly materialRequisitionService: MaterialRequisitionService,
  ) {}

  @Post()
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Create a draft material requisition (no items yet)' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    const dto = await parseDto(CreateMaterialRequisitionDto, body);
    return this.materialRequisitionService.createDraft(
      dto,
      companyId,
      user.userId,
    );
  }

  @Get()
  @ApiOperation({
    summary:
      'List material requisitions (company-wide for hr.view; own otherwise)',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: ListMaterialRequisitionsDto,
  ): Promise<unknown> {
    return this.materialRequisitionService.listRequisitions(
      query,
      companyId,
      user.userId,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a material requisition with items and approval tiers',
  })
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.materialRequisitionService.getRequisition(
      id,
      companyId,
      user.userId,
    );
  }

  @Patch(':id')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'Update header fields of a draft or returned requisition',
  })
  async updateDraft(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    const dto = await parseDto(UpdateMaterialRequisitionDto, body);
    return this.materialRequisitionService.updateDraft(
      id,
      dto,
      companyId,
      user.userId,
    );
  }

  @Post(':id/items')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Add a line item to a draft or returned requisition' })
  async addItem(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    const dto = await parseDto(AddMaterialRequisitionItemDto, body);
    return this.materialRequisitionService.addItem(
      id,
      dto,
      companyId,
      user.userId,
    );
  }

  @Patch(':id/items/:itemId')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Update a line item' })
  async updateItem(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    const dto = await parseDto(UpdateMaterialRequisitionItemDto, body);
    return this.materialRequisitionService.updateItem(
      id,
      itemId,
      dto,
      companyId,
      user.userId,
    );
  }

  @Delete(':id/items/:itemId')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'Remove a line item from a draft or returned requisition',
  })
  deleteItem(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ): Promise<unknown> {
    return this.materialRequisitionService.deleteItem(
      id,
      itemId,
      companyId,
      user.userId,
    );
  }

  @Post(':id/submit')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      'Submit a draft requisition for approval (with optional file attachments)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @UseInterceptors(FilesInterceptor('files', 20, { storage: memoryStorage() }))
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ): Promise<unknown> {
    return this.materialRequisitionService.submitRequisition(
      id,
      files ?? [],
      companyId,
      user.userId,
    );
  }

  @Patch(':id/cancel')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'Cancel a draft or submitted requisition (owner only)',
  })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.materialRequisitionService.cancelRequisition(
      id,
      companyId,
      user.userId,
    );
  }
}
