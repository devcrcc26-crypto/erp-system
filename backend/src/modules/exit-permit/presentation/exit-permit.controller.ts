import { BadRequestException, Controller, Body, Query,Get, Param, UploadedFile, UploadedFiles, UseGuards, Post, UseInterceptors, Patch, Delete } from "@nestjs/common";
import { CreateExitPermitDto, CreateExitPermitItemDto, ListExitPermitsDto, UpdateExitPermitDto, UpdateExitPermitItemDto } from "../application/dtos/exit-permit.dto";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { ExitPermitService } from "../application/services/exit-permit.service";
import { CurrentUser } from "@/shared/decorators/current-user.decorator";
import { CurrentCompany } from "@/shared/decorators/current-company.decorator";
import { AuthenticatedUser } from "@/shared/types/jwt-payload.type";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import {PermissionsGuard} from "@/shared/permissions/permissions.guard";
import { RequireAnyPermission } from "@/shared/permissions/require-any-permission.decorator";
import { DelegatePermissionCheck } from "@/shared/permissions/delegate-permission-check.decorator";
import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";


async function parseDto<T extends object>(
  cls: new () => T,
  body: Record<string, unknown>,
): Promise<T> {
  const dto = plainToInstance(cls, body, { enableImplicitConversion: true });
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length > 0) {
    throw new BadRequestException({
      message: "Validation failed",
      details: errors.map((error) => ({
        property: error.property,
        constraints: error.constraints,
      })),
    });
  }
  return dto;
}

@ApiTags('HR Exit Permits')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission(
    { module: 'hr', action: 'view' },
    { module: 'exit-permit', action: 'view' },
    { module: 'exit-permit', action: 'create' },
)

@Controller('hr/exit-permits')
export class ExitPermitController {
    constructor(
        private readonly exitPermitService: ExitPermitService,
    ){}

    @Post()
    @DelegatePermissionCheck()
    @ApiOperation({
        summary:
            'Create a draft exit permit, optionally with line items in the request body',
    })
    async create(
        @CurrentUser() user: AuthenticatedUser,
        @CurrentCompany() companyId: string,
        @Body() body: Record<string, unknown>,
    ){
        const dto = await parseDto(CreateExitPermitDto, body);
        return this.exitPermitService.createDraft(dto, companyId, user.userId);
    }

    @Get()
    @ApiOperation({ summary: 'List exit permits' })
    list(
        @CurrentUser() user: AuthenticatedUser,
        @CurrentCompany() companyId: string,
        @Query() query: ListExitPermitsDto,
    ){
        return this.exitPermitService.listRequests(query,companyId, user.userId);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get an exit permit by id' })
    getOne(
        @CurrentUser() user: AuthenticatedUser,
        @CurrentCompany() companyId: string,
        @Param('id') id: string,
    ){
        return this.exitPermitService.getRequest(id, companyId, user.userId);
    }

    @Patch(':id')
    @DelegatePermissionCheck()
    @ApiOperation({ summary: 'Update header fields of a draft or returned request' })
    async updateDraft(
        @CurrentUser() user: AuthenticatedUser,
        @CurrentCompany() companyId: string,
        @Param('id') id: string,
        @Body() body: Record<string, unknown>,
    ){
        const dto = await parseDto(UpdateExitPermitDto, body);
        return this.exitPermitService.updateDraft(id, dto, companyId, user.userId);
    }

    @Post(':id/items')
    @DelegatePermissionCheck()
    @ApiOperation({ summary: 'Add an item to an exit permit' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                itemName: { type: 'string' },
                issue: { type: 'string' },
                quantity: { type: 'number' },
                unit: { type: 'string' },
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
    ){
        const dto = await parseDto(CreateExitPermitItemDto, body);
        return this.exitPermitService.addItem(id, dto,file, companyId, user.userId);
    }

    @Patch(':id/items/:itemId')
    @DelegatePermissionCheck()
    @ApiOperation({ summary: 'Update a line item and/or replace its image' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                itemName: { type: 'string' },
                issue: { type: 'string' },
                quantity: { type: 'number' },
                unit: { type: 'string' },
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
    ){
        const dto = await parseDto(UpdateExitPermitItemDto, body);
        return this.exitPermitService.updateItem(id, itemId, dto, file, companyId, user.userId);
    }

    @Delete(':id/items/:itemId')
    @DelegatePermissionCheck()
    @ApiOperation({ summary: 'Delete a line item' })
    deleteItem(
        @CurrentUser() user: AuthenticatedUser,
        @CurrentCompany() companyId: string,
        @Param('id') id: string,
        @Param('itemId') itemId: string,
    ){
        return this.exitPermitService.deleteItem(id, itemId, companyId, user.userId);
    }

    @Post(':id/submit')
    @DelegatePermissionCheck()
    @ApiOperation({ summary: 'Submit an exit permit for approval' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                files: { type: 'array', items: { type: 'string', format: 'binary' } },
            },
        },
    })
    @UseInterceptors(FilesInterceptor('files', 10, { storage: memoryStorage() }))
    submit(
        @CurrentUser() user: AuthenticatedUser,
        @CurrentCompany() companyId: string,
        @Param('id') id: string,
        @UploadedFiles() files?: Express.Multer.File[],
    ){
        return this.exitPermitService.submitRequest(id, files ?? [], companyId, user.userId);
    }

    @Patch(':id/cancel')
    @DelegatePermissionCheck()
    @ApiOperation({ summary: 'Cancel a draft or submitted request (owner only)' })
    cancel(
        @CurrentUser() user: AuthenticatedUser,
        @CurrentCompany() companyId: string,
        @Param('id') id: string,
    ){
        return this.exitPermitService.cancelRequest(id, companyId, user.userId);
    }
}