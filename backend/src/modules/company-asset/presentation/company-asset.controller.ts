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
  StreamableFile,
  UploadedFile,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from "@nestjs/swagger";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { UseInterceptors } from "@nestjs/common";
import { ApiConsumes } from "@nestjs/swagger";

import { CurrentCompany } from "@/shared/decorators/current-company.decorator";
import { CurrentUser } from "@/shared/decorators/current-user.decorator";
import { AuthenticatedUser } from "@/shared/types/jwt-payload.type";
import { PermissionsGuard } from "@/shared/permissions/permissions.guard";
import { RequireAnyPermission } from "@/shared/permissions/require-any-permission.decorator";
import { DelegatePermissionCheck } from "@/shared/permissions/delegate-permission-check.decorator";

import {
  AcknowledgeAssetReturnDto,
  CreateCompanyAssetDto,
  ListCompanyAssetsDto,
  IssueCompanyAssetAssignmentDto,
  ListCompanyAssetAssignmentsDto,
  ReturnCompanyAssetAssignmentDto,
  UpdateCompanyAssetDto,
  UpdateCompanyAssetStatusDto,
} from "../application/dtos/company-asset.dtos";
import { CompanyAssetService } from "../application/services/company-asset.service";
import { CompanyAssetPdfService } from "../application/services/company-asset-pdf.service";

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
      message: "Validation failed",
      details: errors.map((error) => ({
        property: error.property,
        constraints: error.constraints,
      })),
    });
  }

  return dto;
}

@ApiTags("Organization Assets")
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission(
  { module: "assets", action: "view" },
)
@Controller("organization/assets")
export class CompanyAssetController {
  constructor(
    private readonly companyAssetService: CompanyAssetService,
    private readonly companyAssetPdfService: CompanyAssetPdfService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List company assets with search/filter" })
  list(
    @CurrentCompany() companyId: string,
    @Query() query: ListCompanyAssetsDto,
  ): Promise<unknown> {
    return this.companyAssetService.listAssets(query, companyId);
  }

  @Post()
  @DelegatePermissionCheck()
  @RequireAnyPermission(
    { module: "assets", action: "edit" },
  )
  @ApiOperation({ summary: "Create a new company asset" })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    const dto = await parseDto(CreateCompanyAssetDto, body);
    return this.companyAssetService.createAsset(dto, companyId, user.userId);
  }

  @Get("available")
  @ApiOperation({ summary: "List currently available assets" })
  getAvailable(
    @CurrentCompany() companyId: string,
  ): Promise<unknown[]> {
    return this.companyAssetService.getAvailableAssets(companyId);
  }

  @Get("my")
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      "List assets currently assigned to the signed-in employee (any authenticated user)",
  })
  getMine(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<unknown[]> {
    return this.companyAssetService.getMyAssets(companyId, user.userId);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a single asset" })
  getOne(
    @CurrentCompany() companyId: string,
    @Param("id") id: string,
  ): Promise<unknown> {
    return this.companyAssetService.getAsset(id, companyId);
  }

  @Patch(":id")
  @DelegatePermissionCheck()
  @RequireAnyPermission(
    { module: "assets", action: "edit" },
  )
  @ApiOperation({ summary: "Update asset details" })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    const dto = await parseDto(UpdateCompanyAssetDto, body);
    return this.companyAssetService.updateAsset(
      id,
      dto,
      companyId,
      user.userId,
    );
  }

  @Patch(":id/status")
  @DelegatePermissionCheck()
  @RequireAnyPermission(
    { module: "assets", action: "edit" },
  )
  @ApiOperation({ summary: "Update asset status" })
  async updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    const dto = await parseDto(UpdateCompanyAssetStatusDto, body);
    return this.companyAssetService.updateAssetStatus(
      id,
      dto,
      companyId,
      user.userId,
    );
  }

  @Delete(":id")
  @DelegatePermissionCheck()
  @RequireAnyPermission(
    { module: "assets", action: "edit" },
  )
  @ApiOperation({ summary: "Soft-delete an asset" })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param("id") id: string,
  ): Promise<{ success: boolean }> {
    await this.companyAssetService.deleteAsset(id, companyId, user.userId);
    return { success: true };
  }

  @Get(":assetId/assignments")
  @ApiOperation({ summary: "List asset assignments" })
  listAssignments(
    @CurrentCompany() companyId: string,
    @Param("assetId") assetId: string,
    @Query() query: ListCompanyAssetAssignmentsDto,
  ): Promise<unknown> {
    return this.companyAssetService.listAssetAssignments(
      assetId,
      query,
      companyId,
    );
  }

  @Post(":assetId/assignments/issue")
  @DelegatePermissionCheck()
  @RequireAnyPermission(
    { module: "assets", action: "edit" },
  )
  @ApiOperation({ summary: "Issue asset to an employee" })
  async issueAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param("assetId") assetId: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    const dto = await parseDto(IssueCompanyAssetAssignmentDto, body);
    return this.companyAssetService.issueAssetAssignment(
      assetId,
      dto,
      companyId,
      user.userId,
    );
  }

  @Post(":assetId/assignments/:assignmentId/return")
  @DelegatePermissionCheck()
  @RequireAnyPermission(
    { module: "assets", action: "edit" },
  )
  @ApiOperation({ summary: "Return asset from an assignment" })
  async returnAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param("assetId") assetId: string,
    @Param("assignmentId") assignmentId: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    const dto = await parseDto(ReturnCompanyAssetAssignmentDto, body);
    return this.companyAssetService.returnAssetAssignment(
      assetId,
      assignmentId,
      dto,
      companyId,
      user.userId,
    );
  }

  @Post(":assetId/assignments/:assignmentId/initiate-return")
  @DelegatePermissionCheck()
  @ApiOperation({ summary: "Initiate asset return (employee or HR, step 1 of two-step return)" })
  async initiateReturn(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param("assetId") assetId: string,
    @Param("assignmentId") assignmentId: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    const dto = await parseDto(ReturnCompanyAssetAssignmentDto, body);
    return this.companyAssetService.returnAssetAssignment(
      assetId,
      assignmentId,
      dto,
      companyId,
      user.userId,
    );
  }

  @Post(":assetId/assignments/:assignmentId/acknowledge-return")
  @DelegatePermissionCheck()
  @RequireAnyPermission(
    { module: "assets", action: "edit" },
  )
  @ApiOperation({ summary: "HR acknowledges an asset return (step 2 of two-step return)" })
  async acknowledgeReturn(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param("assetId") assetId: string,
    @Param("assignmentId") assignmentId: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    const dto = await parseDto(AcknowledgeAssetReturnDto, body);
    return this.companyAssetService.acknowledgeReturn(
      assetId,
      assignmentId,
      dto,
      companyId,
      user.userId,
    );
  }

  @Get(":id/photo/download-url")
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      "Presigned download URL for an asset photo (HR/assets viewers or current assignee)",
  })
  getPhotoDownloadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param("id") id: string,
  ): Promise<{ url: string; expiresIn: number }> {
    return this.companyAssetService.getAssetPhotoDownloadUrl(
      id,
      companyId,
      user.userId,
    );
  }

  @Post(":id/photo")
  @DelegatePermissionCheck()
  @RequireAnyPermission(
    { module: "documents", action: "create" },
    { module: "assets", action: "edit" },
  )
  @ApiOperation({ summary: "Upload a photo for an asset" })
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage() }))
  async uploadPhoto(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<unknown> {
    if (!file) {
      throw new BadRequestException("Photo file is required");
    }

    // Allow future metadata via `body` without rejecting unknown keys.
    void body;

    return this.companyAssetService.uploadAssetPhoto(
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

  @Delete(":id/photo")
  @DelegatePermissionCheck()
  @RequireAnyPermission(
    { module: "assets", action: "edit" },
  )
  @ApiOperation({ summary: "Remove an asset photo" })
  removePhoto(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param("id") id: string,
  ): Promise<unknown> {
    return this.companyAssetService.removeAssetPhoto(
      id,
      companyId,
      user.userId,
    );
  }

  @Get(":id/pdf")
  @ApiOperation({ summary: "Download company asset card as PDF" })
  @ApiProduces("application/pdf")
  async downloadPdf(
    @Param("id") id: string,
    @CurrentCompany() companyId: string,
  ): Promise<StreamableFile> {
    const file = await this.companyAssetPdfService.getPdf(id, companyId);
    return new StreamableFile(file.buffer, {
      type: file.mimeType,
      disposition: contentDisposition("inline", file.filename),
    });
  }
}

function contentDisposition(kind: "inline" | "attachment", filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
