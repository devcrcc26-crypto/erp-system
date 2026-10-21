import { BadRequestException, Controller, Get, Param, Query, StreamableFile, UploadedFile, UploadedFiles, UseGuards, UseInterceptors } from "@nestjs/common";
import { OfficialSealService } from "../../application/services/official-seal.service";
import { OfficialSealPdfService } from "../../application/services/official-seal-pdf.service";
import { CurrentUser } from "@/shared/decorators/current-user.decorator";
import { CurrentCompany } from "@/shared/decorators/current-company.decorator";
import { Body, Patch, Post } from "@nestjs/common";
import { AuthenticatedUser } from "../../../../shared/types/jwt-payload.type";
import { ListOfficialSealsDto, SubmitOfficialSealRequestDto } from "../../application/dtos/official-seal.dtos";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { DelegatePermissionCheck } from "../../../../shared/permissions/delegate-permission-check.decorator";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiProduces, ApiTags } from "@nestjs/swagger";
import { memoryStorage } from "multer";
import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express";
import { PermissionsGuard } from "@/shared/permissions/permissions.guard";
import { RequireAnyPermission } from "@/shared/permissions/require-any-permission.decorator";

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

  
@ApiTags('HR Official Seal')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission(
    { module: 'official-seal', action: 'view' },
    { module: 'official-seal', action: 'create' },
)       
@Controller('hr/official-seal')
export class OfficialSealController {

    constructor(
      private readonly officialSealService: OfficialSealService,
      private readonly officialSealPdfService: OfficialSealPdfService,
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
        FilesInterceptor('files', 5, { storage: memoryStorage() }),
    )
    @ApiOperation({
        summary: 'Submit a new official seal request',
        description: 'Submit a new official seal request with optional document(s) to seal',
    })
    async submit(
        @CurrentUser() user: AuthenticatedUser,
        @CurrentCompany() companyId: string,
        @Body() body: Record<string, unknown>,
        @UploadedFiles() files?: Express.Multer.File[],
    ): Promise<unknown> {
        const dto = await parseDto(SubmitOfficialSealRequestDto, body);
        return this.officialSealService.submitRequest(
            dto,
            companyId,
            user.userId,
            (files ?? []).map((file) => ({
                originalname: file.originalname,
                mimetype: file.mimetype,
                size: file.size,
                buffer: file.buffer,
            })),
        );
    }


    @Get()
    @ApiOperation({
        summary: 'List official seal requests (company-wide for hr.view; own otherwise)',
    })
    async list(
        @CurrentUser() user: AuthenticatedUser,
        @CurrentCompany() companyId: string,
        @Query() query: ListOfficialSealsDto,
    ): Promise<unknown> {
        return this.officialSealService.listOfficialSeals(
            query,
            companyId,
            user.userId,
        );
    }

    @Get(':id')
    @ApiOperation({
        summary: 'Get an official seal request (company-wide for hr.view; own otherwise)',
    })
    async getOne(
        @CurrentUser() user: AuthenticatedUser,
        @CurrentCompany() companyId: string,
        @Param('id') id: string,
    ): Promise<unknown> {
        return this.officialSealService.getOfficialSeal(
            id,
            companyId,
            user.userId,
        );
    }


    @Patch(':id/cancel')
    @DelegatePermissionCheck()
    @ApiOperation({
        summary: 'Cancel an official seal request',
        description: 'Cancel an official seal request',
    })
    cancel( 
        @CurrentUser() user: AuthenticatedUser,
        @CurrentCompany() companyId: string,
        @Param('id') id: string,
    ): Promise<unknown> {
        return this.officialSealService.cancelOfficialSeal(id, companyId, user.userId);
    }

    @Post(':id/issue')
    @DelegatePermissionCheck()
    @ApiOperation({
        summary: 'Issue an official seal request',
        description: 'Issue an official seal request (only hr can issue)',
    })
    issue(
        @CurrentUser() user: AuthenticatedUser,
        @CurrentCompany() companyId: string,
        @Param('id') id: string,
    ): Promise<unknown> {
        return this.officialSealService.issueSeal(id, companyId, user.userId);
    }

    @Post(':id/seal')
    @DelegatePermissionCheck()
    @ApiConsumes('multipart/form-data')
    @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
    @ApiOperation({
        summary: 'Attach a seal to an official seal request',
        description: 'Attach a seal to an official seal request',
    })
    attachSeal(
        @CurrentUser() user: AuthenticatedUser,
        @CurrentCompany() companyId: string,
        @Param('id') id: string,
        @UploadedFile() file?: Express.Multer.File,
    ): Promise<unknown> {
        if(!file) {
            throw new BadRequestException('Seal file is required');
        }
        return this.officialSealService.issueSeal(id, companyId, user.userId,{
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
            buffer: file.buffer,
        });
    }

    @Get(':id/pdf')
    @ApiOperation({ summary: 'Download official seal request as PDF' })
    @ApiProduces('application/pdf')
    async downloadPdf(
      @Param('id') id: string,
      @CurrentCompany() companyId: string,
    ): Promise<StreamableFile> {
      const file = await this.officialSealPdfService.getPdf(id, companyId);
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