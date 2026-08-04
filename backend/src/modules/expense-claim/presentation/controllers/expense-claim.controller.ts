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
  AddExpenseClaimItemDto,
  CreateExpenseClaimDto,
  ListExpenseClaimsDto,
  UpdateExpenseClaimItemDto,
} from '../../application/dtos/expense-claim.dtos';
import { ExpenseClaimService } from '../../application/services/expense-claim.service';

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

@ApiTags('HR Expense Claims')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission(
  { module: 'hr', action: 'view' },
  { module: 'expense-claim', action: 'view' },
  { module: 'expense-claim', action: 'create' },
)
@Controller('hr/expense-claims')
export class ExpenseClaimController {
  constructor(private readonly expenseClaimService: ExpenseClaimService) {}

  @Post()
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Create a draft expense claim (no items yet)' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    const dto = await parseDto(CreateExpenseClaimDto, body);
    return this.expenseClaimService.createDraft(dto, companyId, user.userId);
  }

  @Get()
  @ApiOperation({
    summary: 'List expense claims (company-wide for hr.view; own otherwise)',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: ListExpenseClaimsDto,
  ): Promise<unknown> {
    return this.expenseClaimService.listClaims(query, companyId, user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an expense claim with items and approval tiers' })
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.expenseClaimService.getClaim(id, companyId, user.userId);
  }

  @Post(':id/items')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Add a line item (with receipt) to a draft claim' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['category', 'description', 'expenseDate', 'amount', 'currency'],
      properties: {
        category: { type: 'string' },
        description: { type: 'string' },
        expenseDate: { type: 'string', format: 'date' },
        amount: { type: 'number' },
        currency: { type: 'string', enum: ['ETB', 'USD', 'CNY'] },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async addItem(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<unknown> {
    const dto = await parseDto(AddExpenseClaimItemDto, body);
    return this.expenseClaimService.addItem(
      id,
      dto,
      file,
      companyId,
      user.userId,
    );
  }

  @Patch(':id/items/:itemId')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Update a line item and/or replace its receipt' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        category: { type: 'string' },
        description: { type: 'string' },
        expenseDate: { type: 'string', format: 'date' },
        amount: { type: 'number' },
        currency: { type: 'string', enum: ['ETB', 'USD', 'CNY'] },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async updateItem(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: Record<string, unknown>,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<unknown> {
    const dto = await parseDto(UpdateExpenseClaimItemDto, body);
    return this.expenseClaimService.updateItem(
      id,
      itemId,
      dto,
      file,
      companyId,
      user.userId,
    );
  }

  @Delete(':id/items/:itemId')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Remove a line item from a draft claim' })
  deleteItem(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ): Promise<unknown> {
    return this.expenseClaimService.deleteItem(
      id,
      itemId,
      companyId,
      user.userId,
    );
  }

  @Post(':id/submit')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Submit a draft claim for approval' })
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.expenseClaimService.submitClaim(id, companyId, user.userId);
  }

  @Patch(':id/cancel')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Cancel a draft or submitted claim (owner only)' })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.expenseClaimService.cancelClaim(id, companyId, user.userId);
  }
}
