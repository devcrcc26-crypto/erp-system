import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentCompany } from '../../../../shared/decorators/current-company.decorator';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequireAnyPermission } from '../../../../shared/permissions/require-any-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  CreateEvaluationCriteriaDto,
  CreateEvaluationTemplateDto,
  UpdateEvaluationCriteriaDto,
  UpdateEvaluationTemplateDto,
} from '../../application/dtos/evaluation-template.dtos';
import { EvaluationTemplateService } from '../../application/services/evaluation-template.service';

@ApiTags('Evaluation Templates')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission(
  { module: 'evaluation', action: 'manage' },
  { module: 'evaluation', action: 'manage' },
)
@Controller('evaluation/templates')
export class EvaluationTemplateController {
  constructor(
    private readonly templateService: EvaluationTemplateService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List evaluation templates' })
  listTemplates(@CurrentCompany() companyId: string): Promise<unknown> {
    return this.templateService.listTemplates(companyId);
  }

  @Get('active')
  @ApiOperation({ summary: 'Get the active evaluation template' })
  getActiveTemplate(@CurrentCompany() companyId: string): Promise<unknown> {
    return this.templateService.getActiveTemplate(companyId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get evaluation template by id' })
  getTemplate(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.templateService.getTemplate(id, companyId);
  }

  @Post()
  @RequireAnyPermission({ module: 'evaluation', action: 'manage' })
  @ApiOperation({ summary: 'Create an evaluation template' })
  createTemplate(
    @Body() dto: CreateEvaluationTemplateDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.templateService.createTemplate(dto, {
      userId: user.userId,
      companyId,
    });
  }

  @Post('sections/:sectionId/criteria')
  @RequireAnyPermission({ module: 'evaluation', action: 'manage' })
  @ApiOperation({ summary: 'Add a criterion to a template section' })
  addCriteria(
    @Param('sectionId') sectionId: string,
    @Body() dto: CreateEvaluationCriteriaDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.templateService.addCriteria(sectionId, dto, {
      userId: user.userId,
      companyId,
    });
  }

  @Patch('criteria/:criteriaId')
  @RequireAnyPermission({ module: 'evaluation', action: 'manage' })
  @ApiOperation({ summary: 'Update an evaluation criterion' })
  updateCriteria(
    @Param('criteriaId') criteriaId: string,
    @Body() dto: UpdateEvaluationCriteriaDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.templateService.updateCriteria(criteriaId, dto, {
      userId: user.userId,
      companyId,
    });
  }

  @Patch(':id')
  @RequireAnyPermission({ module: 'evaluation', action: 'manage' })
  @ApiOperation({ summary: 'Update an evaluation template' })
  updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateEvaluationTemplateDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.templateService.updateTemplate(id, dto, {
      userId: user.userId,
      companyId,
    });
  }
}
