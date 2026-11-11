import {
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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../../../shared/dtos/pagination-query.dto';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  CreateBranchDto,
  CreateCostCentreDto,
  CreateDepartmentDto,
  CreateDisciplineDto,
  CreateDivisionDto,
  CreatePositionDto,
  CreateSeniorityLevelDto,
  ListEngineeringDisciplinesQueryDto,
  OrgEntityListQueryDto,
  AssignDisciplineLeaderDto,
  UpdateBranchDto,
  UpdateCostCentreDto,
  UpdateDepartmentDto,
  UpdateDisciplineDto,
  UpdateDivisionDto,
  UpdatePositionDto,
  UpdateSeniorityLevelDto,
} from '../../application/dtos/company.dtos';
import { CompanySetupService } from '../../application/services/company-setup.service';

@ApiTags('Organisation')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller()
export class OrgController {
  constructor(private readonly companySetupService: CompanySetupService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get('branches')
  @RequirePermission('branches', 'view')
  @ApiOperation({ summary: 'List branches' })
  listBranches(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ): Promise<unknown> {
    return this.companySetupService.listBranches(this.ctx(user), query);
  }

  @Get('branches/:id')
  @RequirePermission('branches', 'view')
  getBranch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.companySetupService.getBranch(this.ctx(user), id);
  }

  @Post('branches')
  @RequirePermission('branches', 'create')
  createBranch(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBranchDto,
  ): Promise<unknown> {
    return this.companySetupService.createBranch(this.ctx(user), dto);
  }

  @Patch('branches/:id')
  @RequirePermission('branches', 'edit')
  updateBranch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateBranchDto,
  ): Promise<unknown> {
    return this.companySetupService.updateBranch(this.ctx(user), id, dto);
  }

  @Delete('branches/:id')
  @RequirePermission('branches', 'delete')
  async deleteBranch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.companySetupService.deleteBranch(this.ctx(user), id);
    return { message: 'Branch deleted' };
  }

  @Get('divisions')
  @RequirePermission('departments', 'view')
  listDivisions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ): Promise<unknown> {
    return this.companySetupService.listDivisions(this.ctx(user), query);
  }

  @Post('divisions')
  @RequirePermission('departments', 'create')
  createDivision(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDivisionDto,
  ): Promise<unknown> {
    return this.companySetupService.createDivision(this.ctx(user), dto);
  }

  @Patch('divisions/:id')
  @RequirePermission('departments', 'edit')
  updateDivision(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateDivisionDto,
  ): Promise<unknown> {
    return this.companySetupService.updateDivision(this.ctx(user), id, dto);
  }

  @Delete('divisions/:id')
  @RequirePermission('departments', 'delete')
  async deleteDivision(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.companySetupService.deleteDivision(this.ctx(user), id);
    return { message: 'Division deleted' };
  }

  @Get('departments')
  @RequirePermission('departments', 'view')
  listDepartments(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OrgEntityListQueryDto,
  ): Promise<unknown> {
    return this.companySetupService.listDepartments(this.ctx(user), query);
  }

  @Get('departments/:id')
  @RequirePermission('departments', 'view')
  @ApiOperation({ summary: 'Get a department by id' })
  getDepartment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.companySetupService.getDepartment(this.ctx(user), id);
  }

  @Post('departments')
  @RequirePermission('departments', 'create')
  createDepartment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDepartmentDto,
  ): Promise<unknown> {
    return this.companySetupService.createDepartment(this.ctx(user), dto);
  }

  @Patch('departments/:id')
  @RequirePermission('departments', 'edit')
  updateDepartment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateDepartmentDto,
  ): Promise<unknown> {
    return this.companySetupService.updateDepartment(this.ctx(user), id, dto);
  }

  @Delete('departments/:id')
  @RequirePermission('departments', 'delete')
  async deleteDepartment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.companySetupService.deleteDepartment(this.ctx(user), id);
    return { message: 'Department deleted' };
  }

  @Get('engineering-disciplines')
  @RequirePermission('departments', 'view')
  @ApiOperation({ summary: 'List engineering disciplines' })
  listDisciplines(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListEngineeringDisciplinesQueryDto,
  ): Promise<unknown> {
    return this.companySetupService.listDisciplines(this.ctx(user), query);
  }

  @Get('engineering-disciplines/:id')
  @RequirePermission('departments', 'view')
  getDiscipline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.companySetupService.getDiscipline(this.ctx(user), id);
  }

  @Post('engineering-disciplines')
  @RequirePermission('departments', 'create')
  createDiscipline(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDisciplineDto,
  ): Promise<unknown> {
    return this.companySetupService.createDiscipline(this.ctx(user), dto);
  }

  @Patch('engineering-disciplines/:id')
  @RequirePermission('departments', 'edit')
  updateDiscipline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateDisciplineDto,
  ): Promise<unknown> {
    return this.companySetupService.updateDiscipline(this.ctx(user), id, dto);
  }

  @Patch('engineering-disciplines/:id/leader')
  @RequirePermission('departments', 'edit')
  @ApiOperation({ summary: 'Assign discipline leader' })
  assignDisciplineLeader(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignDisciplineLeaderDto,
  ): Promise<unknown> {
    return this.companySetupService.assignDisciplineLeader(
      this.ctx(user),
      id,
      dto.leaderId,
    );
  }

  @Patch('disciplines/:id/leader')
  @RequirePermission('departments', 'edit')
  @ApiOperation({ summary: 'Assign discipline leader (alias)' })
  assignDisciplineLeaderAlias(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignDisciplineLeaderDto,
  ): Promise<unknown> {
    return this.companySetupService.assignDisciplineLeader(
      this.ctx(user),
      id,
      dto.leaderId,
    );
  }

  @Delete('engineering-disciplines/:id')
  @RequirePermission('departments', 'delete')
  async deleteDiscipline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.companySetupService.deleteDiscipline(this.ctx(user), id);
    return { message: 'Discipline deleted' };
  }

  @Get('cost-centres')
  @RequirePermission('departments', 'view')
  listCostCentres(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ): Promise<unknown> {
    return this.companySetupService.listCostCentres(this.ctx(user), query);
  }

  @Post('cost-centres')
  @RequirePermission('departments', 'create')
  createCostCentre(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCostCentreDto,
  ): Promise<unknown> {
    return this.companySetupService.createCostCentre(this.ctx(user), dto);
  }

  @Patch('cost-centres/:id')
  @RequirePermission('departments', 'edit')
  updateCostCentre(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCostCentreDto,
  ): Promise<unknown> {
    return this.companySetupService.updateCostCentre(this.ctx(user), id, dto);
  }

  @Delete('cost-centres/:id')
  @RequirePermission('departments', 'delete')
  async deleteCostCentre(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.companySetupService.deleteCostCentre(this.ctx(user), id);
    return { message: 'Cost centre deleted' };
  }

  @Get('positions')
  @RequirePermission('departments', 'view')
  listPositions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OrgEntityListQueryDto,
  ): Promise<unknown> {
    return this.companySetupService.listPositions(this.ctx(user), query);
  }

  @Post('positions')
  @RequirePermission('departments', 'create')
  createPosition(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePositionDto,
  ): Promise<unknown> {
    return this.companySetupService.createPosition(this.ctx(user), dto);
  }

  @Patch('positions/:id')
  @RequirePermission('departments', 'edit')
  updatePosition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePositionDto,
  ): Promise<unknown> {
    return this.companySetupService.updatePosition(this.ctx(user), id, dto);
  }

  @Delete('positions/:id')
  @RequirePermission('departments', 'delete')
  async deletePosition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.companySetupService.deletePosition(this.ctx(user), id);
    return { message: 'Position deleted' };
  }

  @Get('seniority-levels')
  @RequirePermission('departments', 'view')
  @ApiOperation({ summary: 'List seniority levels (display order)' })
  listSeniorityLevels(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OrgEntityListQueryDto,
  ): Promise<unknown> {
    return this.companySetupService.listSeniorityLevels(this.ctx(user), query);
  }

  @Post('seniority-levels')
  @RequirePermission('departments', 'create')
  createSeniorityLevel(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSeniorityLevelDto,
  ): Promise<unknown> {
    return this.companySetupService.createSeniorityLevel(this.ctx(user), dto);
  }

  @Patch('seniority-levels/:id')
  @RequirePermission('departments', 'edit')
  updateSeniorityLevel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateSeniorityLevelDto,
  ): Promise<unknown> {
    return this.companySetupService.updateSeniorityLevel(this.ctx(user), id, dto);
  }

  @Delete('seniority-levels/:id')
  @RequirePermission('departments', 'delete')
  async deleteSeniorityLevel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.companySetupService.deleteSeniorityLevel(this.ctx(user), id);
    return { message: 'Seniority level deleted' };
  }
}
