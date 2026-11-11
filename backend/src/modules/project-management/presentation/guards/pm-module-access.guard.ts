import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import { ProjectScopeService } from '../../application/services/project-scope.service';
import { PmModuleKey } from '../../domain/project-modules.const';
import { PM_MODULE_KEY } from './require-pm-module.decorator';

/**
 * Enforces per-team-member module visibility before PM module endpoints run.
 */
@Injectable()
export class PmModuleAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly projectScopeService: ProjectScopeService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const module = this.reflector.getAllAndOverride<PmModuleKey | undefined>(
      PM_MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!module) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;
    const rawProjectId = request.params.projectId;
    const projectId = Array.isArray(rawProjectId) ? rawProjectId[0] : rawProjectId;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    if (!projectId) {
      throw new ForbiddenException('Project context required');
    }

    await this.projectScopeService.assertModuleAccess(
      { companyId: user.companyId, userId: user.userId },
      projectId,
      module,
    );

    return true;
  }
}
