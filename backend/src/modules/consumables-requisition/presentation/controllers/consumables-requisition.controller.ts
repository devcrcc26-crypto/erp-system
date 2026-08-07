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
  AddConsumablesRequisitionItemDto,
  CreateConsumablesRequisitionDto,
  ListConsumablesRequisitionsDto,
  UpdateConsumablesRequisitionDto,
  UpdateConsumablesRequisitionItemDto,
} from '../../application/dtos/consumables-requisition.dtos';
import { ConsumablesRequisitionService } from '../../application/services/consumables-requisition.service';

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

@ApiTags('HR Consumables Requisitions')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission(
  { module: 'hr', action: 'view' },
  { module: 'consumables', action: 'view' },
  { module: 'consumables', action: 'create' },
)
@Controller('hr/consumables')
export class ConsumablesRequisitionController {
  constructor(
    private readonly consumablesRequisitionService: ConsumablesRequisitionService,
  ) {}

  @Post()
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'Create a draft consumables requisition (no items yet)',
  })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    const dto = await parseDto(CreateConsumablesRequisitionDto, body);
    return this.consumablesRequisitionService.createDraft(
      dto,
      companyId,
      user.userId,
    );
  }

  @Get()
  @ApiOperation({
    summary:
      'List consumables requisitions (company-wide for hr.view; own otherwise)',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: ListConsumablesRequisitionsDto,
  ): Promise<unknown> {
    return this.consumablesRequisitionService.listRequisitions(
      query,
      companyId,
      user.userId,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a consumables requisition with items and approval tiers',
  })
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.consumablesRequisitionService.getRequisition(
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
    const dto = await parseDto(UpdateConsumablesRequisitionDto, body);
    return this.consumablesRequisitionService.updateDraft(
      id,
      dto,
      companyId,
      user.userId,
    );
  }

  @Post(':id/items')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'Add a line item (max 20) to a draft or returned requisition',
  })
  async addItem(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    const dto = await parseDto(AddConsumablesRequisitionItemDto, body);
    return this.consumablesRequisitionService.addItem(
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
    const dto = await parseDto(UpdateConsumablesRequisitionItemDto, body);
    return this.consumablesRequisitionService.updateItem(
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
    return this.consumablesRequisitionService.deleteItem(
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
      'Submit a draft requisition (1-tier HR Officer, or direct APPROVED for HR+)',
  })
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.consumablesRequisitionService.submitRequisition(
      id,
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
    return this.consumablesRequisitionService.cancelRequisition(
      id,
      companyId,
      user.userId,
    );
  }
}
