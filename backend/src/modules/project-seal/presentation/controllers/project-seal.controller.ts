import { CurrentCompany } from "@/shared/decorators/current-company.decorator";
import { ProjectSealService } from "../../application/services/project-seal.service";
import { CurrentUser } from "@/shared/decorators/current-user.decorator";
import { AuthenticatedUser } from "@/shared/types/jwt-payload.type";
import { BadRequestException, Controller, StreamableFile, UploadedFile, UseInterceptors } from "@nestjs/common";
import { Body, Post, Get, Query, Param, Patch } from "@nestjs/common";
import { UploadedFiles } from "@nestjs/common";
import { PermissionsGuard } from "@/shared/permissions/permissions.guard";
import { ApiConsumes, ApiOperation, ApiProduces, ApiTags, ApiBody } from "@nestjs/swagger";
import { ApiBearerAuth } from "@nestjs/swagger";
import { UseGuards } from "@nestjs/common";
import { RequireAnyPermission } from "@/shared/permissions/require-any-permission.decorator";
import { DelegatePermissionCheck } from "@/shared/permissions/delegate-permission-check.decorator";
import { memoryStorage } from "multer";
import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { SubmitProjectSealRequestDto, ListProjectSealsDto } from "../../application/dtos/project-seal.dtos";
import { ProjectSealPdfService } from "../../application/services/project-seal-pdf.service";


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

@ApiTags('HR Project Seal')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission(
    {module: 'project-seal', action: 'view'},
    {module: 'project-seal', action: 'create'}
)
@Controller('hr/project-seal')
export class ProjectSealController {
    constructor(
      private readonly projectSealService: ProjectSealService,
      private readonly projectSealPdfService: ProjectSealPdfService,
    ) {}


    @Post()
    @DelegatePermissionCheck()
    @ApiConsumes('multipart/form-data', 'application/json')
    @ApiBody({
        schema: {
            type: 'object',
            required: ['fileName', 'description', 'urgency', 'dateNeeded'],
            properties: {
                fileName: { type: 'string' },
                description: { type: 'string' },
                urgency: { type: 'string' },
                dateNeeded: { type: 'string', format: 'date' },
                files: {
                    type: 'array',
                    items: { type: 'string', format: 'binary' },
                },
            },
        },
    })
    @UseInterceptors(
        FilesInterceptor( 'files', 5, {storage: memoryStorage()} ),
    )

    @ApiOperation({ 
        summary: 'Submit a new project seal request',
        description: 'Submit a new project seal request with optional document(s) to seal',
    })
    async submit(
        @CurrentUser() user: AuthenticatedUser,
        @CurrentCompany() companyId: string,
        @Body() body: Record<string, unknown>,
        @UploadedFiles() files?: Express.Multer.File[],
    ): Promise<unknown> {
        const dto = await parseDto(SubmitProjectSealRequestDto, body);
        return this.projectSealService.submitRequest(dto, companyId, user.userId, 
            (files ?? []).map((file) => ({
                originalname: file.originalname,
                mimetype: file.mimetype,
                size: file.size,
                buffer: file.buffer,
            })),
        );
    }


    @Get()
    @ApiOperation({ summary: 'List project seal requests' })
    async list(
        @CurrentUser() user: AuthenticatedUser,
        @CurrentCompany() companyId: string,
        @Query() query: ListProjectSealsDto,
    ): Promise<unknown> {
        return this.projectSealService.listProjectSeals(query, companyId, user.userId);
    }


    @Get(':id')
    @ApiOperation({ summary: 'Get a project seal request by id' })
    async getOne(
        @CurrentUser() user: AuthenticatedUser,
        @CurrentCompany() companyId: string,
        @Param('id') id: string,
    ){
        return this.projectSealService.getProjectSeal(id, companyId, user.userId);
    }

    @Patch(':id/cancel')
    @DelegatePermissionCheck()
    @ApiOperation({ 
        summary: 'Cancel a project seal request by id',
        description: 'Cancel a project seal request by id',
    })
    cancel(
        @CurrentUser() user: AuthenticatedUser,
        @CurrentCompany() companyId: string,
        @Param('id') id: string,
    ): Promise<unknown>{
        return this.projectSealService.cancelProjectSeal(id, companyId, user.userId);
    }

    @Post(':id/issue')
    @DelegatePermissionCheck()
    @ApiOperation({ 
        summary: 'Issue a project seal request by id',
        description: 'Issue a project seal request by id',
    })
    issue(
        @CurrentUser() user: AuthenticatedUser,
        @CurrentCompany() companyId: string,
        @Param('id') id: string,
    ):Promise<unknown>{
        return this.projectSealService.issueSeal(id, companyId, user.userId);
    }

    @Post(':id/seal')
    @DelegatePermissionCheck()
    @ApiConsumes('multipart/form-data')
    @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
    @ApiOperation({ 
        summary: 'Attach a seal to a project seal request by id',
        description: 'Attach a seal to a project seal request by id',
    })
    attachSeal(
        @CurrentUser() user: AuthenticatedUser,
        @CurrentCompany() companyId: string,
        @Param('id') id: string,
        @UploadedFile() file?: Express.Multer.File,
    ):Promise<unknown>{
        if(!file) {
            throw new BadRequestException('No file uploaded');
        }
        return this.projectSealService.issueSeal(id, companyId, user.userId,{
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
            buffer: file.buffer,
        });
    }

    @Get(':id/pdf')
    @ApiOperation({ summary: 'Download project seal request as PDF' })
    @ApiProduces('application/pdf')
    async downloadPdf(
      @Param('id') id: string,
      @CurrentCompany() companyId: string,
    ): Promise<StreamableFile> {
      const file = await this.projectSealPdfService.getPdf(id, companyId);
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