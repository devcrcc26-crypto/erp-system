import { Injectable } from '@nestjs/common';
import {
  DesignPackage,
  DesignPackageProjectedStatus,
  TaskDisciplineProjectedStatus,
} from '@prisma/client';
import { DesignPackageProjectedStatus as DomainPackageStatus } from '../../domain/contracts/enums/design-package-projected-status.enum';
import { EdvStatus } from '../../domain/contracts/enums/edv-status.enum';
import { TaskDisciplineProjectedStatus as DomainDisciplineStatus } from '../../domain/contracts/enums/task-discipline-projected-status.enum';
import { resolveDisciplineProjectedStatus } from '../../domain/discipline-status-resolver';
import { resolvePackageProjectedStatus } from '../../domain/package-status-resolver';
import {
  EpcWorkflowRepository,
  PrismaTx,
} from '../../infrastructure/repositories/epc-workflow.repository';

export interface PhaseBProjectionResult {
  readonly packageStatuses: Readonly<Record<string, DomainPackageStatus>>;
  readonly disciplineStatuses: Readonly<Record<string, DomainDisciplineStatus>>;
}

export interface ProjectionDriftCorrection {
  readonly entityType: 'DesignPackage' | 'TaskDiscipline';
  readonly entityId: string;
  readonly beforeStatus: string;
  readonly afterStatus: string;
}

/**
 * Phase B - structural aggregate projection using Wave 0.5 pure resolvers only.
 */
@Injectable()
export class StateProjectionService {
  constructor(private readonly epcWorkflowRepository: EpcWorkflowRepository) {}

  /**
   * Recomputes dirty packages and parent disciplines inside the active transaction.
   */
  async recomputeDirtyInTx(
    tx: PrismaTx,
    companyId: string,
    updatedBy: string,
    options?: { packageIds?: readonly string[] },
  ): Promise<PhaseBProjectionResult> {
    const dirtyPackages = await this.epcWorkflowRepository.findDirtyPackages(
      tx,
      companyId,
      options?.packageIds,
    );

    const packageStatuses: Record<string, DomainPackageStatus> = {};
    const disciplineIds = new Set<string>();

    for (const pkg of dirtyPackages) {
      const projected = await this.recomputePackageInTx(
        tx,
        companyId,
        pkg,
        updatedBy,
      );
      packageStatuses[pkg.id] = projected;
      disciplineIds.add(pkg.taskDisciplineId);
    }

    const disciplineStatuses: Record<string, DomainDisciplineStatus> = {};
    for (const disciplineId of disciplineIds) {
      disciplineStatuses[disciplineId] = await this.recomputeDisciplineInTx(
        tx,
        companyId,
        disciplineId,
        updatedBy,
      );
    }

    return { packageStatuses, disciplineStatuses };
  }

  /**
   * Full reconciliation - recomputes all packages and disciplines for drift correction.
   */
  async reconcileCompanyInTx(
    tx: PrismaTx,
    companyId: string,
    updatedBy: string,
  ): Promise<{
    corrections: ProjectionDriftCorrection[];
    result: PhaseBProjectionResult;
  }> {
    const packages = await this.epcWorkflowRepository.findAllPackages(
      tx,
      companyId,
    );
    const corrections: ProjectionDriftCorrection[] = [];
    const packageStatuses: Record<string, DomainPackageStatus> = {};
    const disciplineIds = new Set<string>();

    for (const pkg of packages) {
      const before = pkg.projectedStatus;
      const after = await this.recomputePackageInTx(
        tx,
        companyId,
        pkg,
        updatedBy,
        false,
      );
      packageStatuses[pkg.id] = after;
      disciplineIds.add(pkg.taskDisciplineId);
      if (before !== (after as DesignPackageProjectedStatus)) {
        corrections.push({
          entityType: 'DesignPackage',
          entityId: pkg.id,
          beforeStatus: before,
          afterStatus: after,
        });
      }
    }

    const disciplineStatuses: Record<string, DomainDisciplineStatus> = {};
    for (const disciplineId of disciplineIds) {
      const before =
        await this.epcWorkflowRepository.findDisciplineProjectedStatus(
          tx,
          companyId,
          disciplineId,
        );
      const after = await this.recomputeDisciplineInTx(
        tx,
        companyId,
        disciplineId,
        updatedBy,
      );
      disciplineStatuses[disciplineId] = after;
      if (before && before !== (after as TaskDisciplineProjectedStatus)) {
        corrections.push({
          entityType: 'TaskDiscipline',
          entityId: disciplineId,
          beforeStatus: before,
          afterStatus: after,
        });
      }
    }

    return {
      corrections,
      result: { packageStatuses, disciplineStatuses },
    };
  }

  private async recomputePackageInTx(
    tx: PrismaTx,
    companyId: string,
    pkg: DesignPackage,
    updatedBy: string,
    clearDirtyFlag = true,
  ): Promise<DomainPackageStatus> {
    const edvStatuses = await this.epcWorkflowRepository.findPackageEdvStatuses(
      tx,
      companyId,
      pkg.id,
    );
    const activeGovernanceSession =
      await this.epcWorkflowRepository.hasActiveReviewSessionForPackage(
        tx,
        companyId,
        pkg.id,
      );

    const projected = resolvePackageProjectedStatus({
      edvStatuses: edvStatuses.map((s) => s as EdvStatus),
      activeGovernanceSession,
    });

    await this.epcWorkflowRepository.updatePackageProjection(
      tx,
      pkg.id,
      projected as DesignPackageProjectedStatus,
      updatedBy,
      clearDirtyFlag,
    );

    return projected;
  }

  private async recomputeDisciplineInTx(
    tx: PrismaTx,
    companyId: string,
    taskDisciplineId: string,
    updatedBy: string,
  ): Promise<DomainDisciplineStatus> {
    const packages = await this.epcWorkflowRepository.findPackagesByDiscipline(
      tx,
      companyId,
      taskDisciplineId,
    );

    const projected = resolveDisciplineProjectedStatus(
      packages.map((p) => p.projectedStatus as DomainPackageStatus),
    );

    await this.epcWorkflowRepository.updateDisciplineProjection(
      tx,
      taskDisciplineId,
      projected as TaskDisciplineProjectedStatus,
      updatedBy,
    );

    return projected;
  }
}
