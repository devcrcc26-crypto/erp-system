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
  CreateEvaluationCycleDto,
  UpdateEvaluationCycleDto,
} from '../../application/dtos/evaluation-cycle.dtos';
import { EvaluationCycleService } from '../../application/services/evaluation-cycle.service';

@ApiTags('Evaluation Cycles')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission(
  { module: 'evaluation', action: 'manage' },
  { module: 'evaluation', action: 'manage' },
)
@Controller('evaluation/cycles')
export class EvaluationCycleController {
  constructor(private readonly cycleService: EvaluationCycleService) {}

  @Get()
  // Cycle names only - supervisors filter their team's evaluations by cycle.
  @RequireAnyPermission(
    { module: 'evaluation', action: 'view' },
    { module: 'evaluation', action: 'manage' },
  )
  @ApiOperation({ summary: 'List evaluation cycles' })
  listCycles(@CurrentCompany() companyId: string): Promise<unknown> {
    return this.cycleService.listCycles(companyId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get evaluation cycle by id' })
  getCycle(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.cycleService.getCycle(id, companyId);
  }

  @Post()
  @RequireAnyPermission({ module: 'evaluation', action: 'manage' })
  @ApiOperation({ summary: 'Create an evaluation cycle' })
  createCycle(
    @Body() dto: CreateEvaluationCycleDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.cycleService.createCycle(dto, {
      userId: user.userId,
      companyId,
    });
  }

  @Patch(':id')
  @RequireAnyPermission({ module: 'evaluation', action: 'manage' })
  @ApiOperation({ summary: 'Update an evaluation cycle' })
  updateCycle(
    @Param('id') id: string,
    @Body() dto: UpdateEvaluationCycleDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.cycleService.updateCycle(id, dto, {
      userId: user.userId,
      companyId,
    });
  }

  @Post(':id/activate')
  @RequireAnyPermission({ module: 'evaluation', action: 'manage' })
  @ApiOperation({ summary: 'Activate a DRAFT evaluation cycle' })
  activateCycle(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.cycleService.activateCycle(id, {
      userId: user.userId,
      companyId,
    });
  }

  @Post(':id/close')
  @RequireAnyPermission({ module: 'evaluation', action: 'manage' })
  @ApiOperation({ summary: 'Close an ACTIVE evaluation cycle' })
  closeCycle(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.cycleService.closeCycle(id, {
      userId: user.userId,
      companyId,
    });
  }
}
