import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentCompany } from '../../../../shared/decorators/current-company.decorator';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { DelegatePermissionCheck } from '../../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequireAnyPermission } from '../../../../shared/permissions/require-any-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  CreateEmployeeEvaluationDto,
  DisputeEvaluationDto,
  DLRespondToDisputeDto,
  EmployeeRespondToDLDto,
  HRDecideDisputeDto,
  SubmitAssessmentDto,
} from '../../application/dtos/evaluation.dtos';
import { EvaluationService } from '../../application/services/evaluation.service';
import { EvaluationSchedulerService } from '../../application/services/evaluation-scheduler.service';

@ApiTags('Evaluations')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission(
  { module: 'hr', action: 'view' },
  { module: 'hr', action: 'create' },
)
@Controller('evaluation/evaluations')
export class EvaluationController {
  constructor(
    private readonly evaluationService: EvaluationService,
    private readonly permissionService: PermissionService,
    private readonly schedulerService: EvaluationSchedulerService,
  ) {}

  @Get()
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'List evaluations' })
  async listEvaluations(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query('cycleId') cycleId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
    @Query('disciplineLeadId') disciplineLeadId?: string,
    @Query('teamLeadId') teamLeadId?: string,
  ): Promise<unknown> {
    const resolvedEmployeeId =
      employeeId === 'me' ? user.userId : employeeId;
    const resolvedDisciplineLeadId =
      disciplineLeadId === 'me' ? user.userId : disciplineLeadId;
    const resolvedTeamLeadId =
      teamLeadId === 'me' ? user.userId : teamLeadId;

    const selfScoped =
      resolvedEmployeeId === user.userId ||
      resolvedDisciplineLeadId === user.userId ||
      resolvedTeamLeadId === user.userId;

    if (!selfScoped) {
      const hasHr =
        (await this.permissionService.hasPermission(
          user.userId,
          companyId,
          'hr',
          'view',
        )) ||
        (await this.permissionService.hasPermission(
          user.userId,
          companyId,
          'hr',
          'create',
        ));
      if (!hasHr) {
        throw new ForbiddenException(
          'Missing permission to list company evaluations',
        );
      }
    }

    return this.evaluationService.listEvaluations(companyId, {
      cycleId,
      employeeId: resolvedEmployeeId,
      status,
      disciplineLeadId: resolvedDisciplineLeadId,
      teamLeadId: resolvedTeamLeadId,
    });
  }

  @Get('my')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'List evaluations for the current user' })
  getMyEvaluations(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.evaluationService.listEvaluations(companyId, {
      employeeId: user.userId,
    });
  }

  @Get('pending-my-action')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      'List evaluations pending Discipline Lead or Team Lead action for current user',
  })
  getPendingMyAction(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.evaluationService.getPendingMyAction(
      companyId,
      user.userId,
    );
  }

  @Get('contract/:contractId/history')
  @ApiOperation({
    summary: 'Get evaluation history linked to an employee contract',
  })
  getContractHistory(
    @Param('contractId') contractId: string,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.evaluationService.getEvaluationHistoryForContract(
      contractId,
      companyId,
    );
  }

  @Get(':id')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Get evaluation by id' })
  getEvaluation(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.evaluationService.getEvaluationById(
      id,
      companyId,
      user.userId,
    );
  }

  @Post()
  @RequireAnyPermission({ module: 'hr', action: 'create' })
  @ApiOperation({ summary: 'Create an employee evaluation' })
  createEvaluation(
    @Body() dto: CreateEmployeeEvaluationDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.evaluationService.createEvaluation(dto, {
      userId: user.userId,
      companyId,
    });
  }

  @Post('cycle/:cycleId/bulk-create')
  @RequireAnyPermission({ module: 'hr', action: 'create' })
  @ApiOperation({ summary: 'Bulk-create evaluations for all active employees' })
  createEvaluationsForCycle(
    @Param('cycleId') cycleId: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.evaluationService.createEvaluationsForCycle(cycleId, {
      userId: user.userId,
      companyId,
    });
  }

  @Post('admin/auto-resolve')
  @RequireAnyPermission({ module: 'hr', action: 'create' })
  @ApiOperation({
    summary: 'Manually trigger auto-resolve of expired evaluation deadlines',
  })
  triggerAutoResolve(
    @CurrentCompany() companyId: string,
  ): Promise<{ resolved: number; details: string }> {
    return this.schedulerService.triggerManualAutoResolve(companyId);
  }

  @Post(':id/self-assessment')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Submit self-assessment' })
  submitSelfAssessment(
    @Param('id') id: string,
    @Body() dto: SubmitAssessmentDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.evaluationService.submitSelfAssessment(id, dto, {
      userId: user.userId,
      companyId,
    });
  }

  @Post(':id/team-lead-assessment')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Submit Team Lead assessment' })
  submitTeamLeadAssessment(
    @Param('id') id: string,
    @Body() dto: SubmitAssessmentDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.evaluationService.submitTeamLeadAssessment(id, dto, {
      userId: user.userId,
      companyId,
    });
  }

  @Post(':id/discipline-lead-assessment')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Submit Discipline Lead assessment' })
  submitDisciplineLeadAssessment(
    @Param('id') id: string,
    @Body() dto: SubmitAssessmentDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.evaluationService.submitDisciplineLeadAssessment(id, dto, {
      userId: user.userId,
      companyId,
    });
  }

  @Post(':id/share-result')
  @RequireAnyPermission({ module: 'hr', action: 'create' })
  @ApiOperation({ summary: 'Share consolidated result with employee' })
  shareResult(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.evaluationService.shareResultWithEmployee(id, {
      userId: user.userId,
      companyId,
    });
  }

  @Post(':id/accept')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Employee accepts evaluation result' })
  acceptResult(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.evaluationService.acceptResult(id, {
      userId: user.userId,
      companyId,
    });
  }

  @Post(':id/dispute')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Employee disputes evaluation result' })
  disputeResult(
    @Param('id') id: string,
    @Body() dto: DisputeEvaluationDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.evaluationService.disputeResult(id, dto, {
      userId: user.userId,
      companyId,
    });
  }

  @Post(':id/dl-respond')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Discipline Lead responds to dispute' })
  dlRespondToDispute(
    @Param('id') id: string,
    @Body() dto: DLRespondToDisputeDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.evaluationService.dlRespondToDispute(id, dto, {
      userId: user.userId,
      companyId,
    });
  }

  @Post(':id/employee-respond')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Employee responds to DL decision' })
  employeeRespondToDL(
    @Param('id') id: string,
    @Body() dto: EmployeeRespondToDLDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.evaluationService.employeeRespondToDL(id, dto, {
      userId: user.userId,
      companyId,
    });
  }

  @Post(':id/hr-decide')
  @RequireAnyPermission({ module: 'hr', action: 'create' })
  @ApiOperation({ summary: 'HR decides escalated dispute' })
  hrDecideDispute(
    @Param('id') id: string,
    @Body() dto: HRDecideDisputeDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.evaluationService.hrDecideDispute(id, dto, {
      userId: user.userId,
      companyId,
    });
  }

  @Post(':id/lock')
  @RequireAnyPermission({ module: 'hr', action: 'create' })
  @ApiOperation({ summary: 'Lock an accepted or HR-decided evaluation' })
  lockEvaluation(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.evaluationService.lockEvaluation(id, {
      userId: user.userId,
      companyId,
    });
  }
}
