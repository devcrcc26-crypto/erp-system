import { ConflictException, Injectable } from '@nestjs/common';
import {
  DesignPackageProjectedStatus,
  DesignPackageDependencyType,
  EdvStatus,
  ReviewSessionStatus,
} from '@prisma/client';
import { CommentStatus as DomainCommentStatus } from '../../domain/contracts/enums/comment-status.enum';
import { EdvStatus as DomainEdvStatus } from '../../domain/contracts/enums/edv-status.enum';
import { edvStatusAllowsComments } from '../../domain/edv-state-machine';
import { EdvWithDiscipline } from '../../infrastructure/repositories/epc-workflow.repository';
import { PrismaTx } from '../../infrastructure/repositories/epc-workflow.repository';
import { EpcReviewRepository } from '../../infrastructure/repositories/epc-review.repository';

export interface BatchTransitionPlan {
  readonly edvId: string;
  readonly from: EdvStatus;
  readonly to: EdvStatus;
}

/**
 * V1 conflict guards for EDV workflow mutations (Wave 2 minimum).
 */
@Injectable()
export class ConflictGuardService {
  constructor(private readonly epcReviewRepository: EpcReviewRepository) {}

  /**
   * Blocks submit when an active review session already exists on the package.
   */
  async assertNoActiveSessionOnPackage(
    tx: PrismaTx,
    companyId: string,
    designPackageId: string,
  ): Promise<void> {
    const active = await this.epcReviewRepository.findActiveSessionForPackage(
      tx,
      companyId,
      designPackageId,
    );
    if (active) {
      throw new ConflictException(
        `Active review session ${active.id} already exists for package`,
      );
    }
  }

  /**
   * Blocks new EDV upload when an active review session covers the document.
   */
  async assertNoActiveSessionForEdv(
    tx: PrismaTx,
    companyId: string,
    engineeringDocumentVersionId: string,
  ): Promise<void> {
    const active = await this.epcReviewRepository.findActiveSessionForEdv(
      tx,
      companyId,
      engineeringDocumentVersionId,
    );
    if (active) {
      throw new ConflictException(
        'Cannot upload new version while an active review session exists',
      );
    }
  }

  /**
   * Validates FINISH_TO_START prerequisites are LOCKED before submit.
   */
  async assertSubmitDependenciesSatisfied(
    tx: PrismaTx,
    companyId: string,
    designPackageId: string,
  ): Promise<void> {
    const deps = await this.epcReviewRepository.findPackageDependencies(
      tx,
      companyId,
      designPackageId,
    );

    for (const dep of deps) {
      if (dep.dependencyType !== DesignPackageDependencyType.FINISH_TO_START) {
        continue;
      }

      const prerequisite = await tx.designPackage.findFirst({
        where: { id: dep.dependsOnPackageId, companyId, deletedAt: null },
      });
      if (!prerequisite) {
        throw new ConflictException(
          `Prerequisite package ${dep.dependsOnPackageId} not found`,
        );
      }
      if (prerequisite.projectedStatus !== DesignPackageProjectedStatus.APPROVED) {
        throw new ConflictException(
          `Prerequisite package ${dep.dependsOnPackageId} must be APPROVED`,
        );
      }

      const lockedIds = await this.epcReviewRepository.findLockedEdvIdsForPackage(
        tx,
        companyId,
        dep.dependsOnPackageId,
      );
      const itemCount = await tx.designPackageItem.count({
        where: { companyId, designPackageId: dep.dependsOnPackageId },
      });
      if (itemCount > 0 && lockedIds.length < itemCount) {
        throw new ConflictException(
          `Prerequisite package ${dep.dependsOnPackageId} EDVs must all be LOCKED`,
        );
      }
    }
  }

  /**
   * Package submit requires all item EDVs in DRAFT.
   */
  assertPackageSubmitEdvStates(edvStatuses: readonly DomainEdvStatus[]): void {
    if (edvStatuses.length === 0) {
      throw new ConflictException('Design package has no EDV items to submit');
    }
    for (const status of edvStatuses) {
      if (status !== DomainEdvStatus.DRAFT) {
        throw new ConflictException(
          `All package EDVs must be DRAFT to submit; found ${status}`,
        );
      }
    }
  }

  /**
   * Comments forbidden on LOCKED EDV.
   */
  assertEdvAllowsComments(edvStatus: DomainEdvStatus): void {
    if (!edvStatusAllowsComments(edvStatus)) {
      throw new ConflictException(
        'Comments are only allowed on IN_REVIEW or APPROVED EDVs',
      );
    }
  }

  /**
   * Batch approve requires active session and matching package.
   */
  assertReviewSessionActiveForPackage(
    sessionStatus: ReviewSessionStatus,
    sessionPackageId: string,
    designPackageId: string,
  ): void {
    if (sessionStatus !== ReviewSessionStatus.ACTIVE) {
      throw new ConflictException('Review session is not ACTIVE');
    }
    if (sessionPackageId !== designPackageId) {
      throw new ConflictException('Review session does not belong to package');
    }
  }

  /**
   * Blocks batch approve when comments are not all VERIFIED/CLOSED.
   */
  assertCommentsClearForApproval(
    commentStatuses: readonly DomainCommentStatus[],
  ): void {
    const blocking = commentStatuses.filter(
      (s) =>
        s !== DomainCommentStatus.VERIFIED && s !== DomainCommentStatus.CLOSED,
    );
    if (blocking.length > 0) {
      throw new ConflictException(
        'Batch approve blocked: open comments must be VERIFIED or CLOSED',
      );
    }
  }

  /**
   * Blocks new revision upload when document is in active review.
   * Allows uploads when the package is RETURNED_FOR_REWORK (designer rework path).
   */
  async assertNoActiveSessionForEngineeringDocument(
    companyId: string,
    engineeringDocumentId: string,
  ): Promise<void> {
    const returned =
      await this.epcReviewRepository.findReturnedSessionForEngineeringDocument(
        companyId,
        engineeringDocumentId,
      );
    if (returned) {
      return;
    }

    const active =
      await this.epcReviewRepository.findActiveSessionForEngineeringDocument(
        companyId,
        engineeringDocumentId,
      );
    if (active) {
      throw new ConflictException(
        'Cannot upload new version while an active review session exists',
      );
    }
  }

  /**
   * True when the document's package is RETURNED_FOR_REWORK - designer may
   * supersede the returned DRAFT and upload a replacement revision.
   */
  async isReturnedForRework(
    companyId: string,
    engineeringDocumentId: string,
  ): Promise<boolean> {
    const returned =
      await this.epcReviewRepository.findReturnedSessionForEngineeringDocument(
        companyId,
        engineeringDocumentId,
      );
    return Boolean(returned);
  }

  /**
   * Ensures all EDVs exist and match expected count for batch operations.
   */
  assertBatchEdvsResolved(
    requestedIds: readonly string[],
    loaded: readonly EdvWithDiscipline[],
  ): void {
    if (loaded.length !== requestedIds.length) {
      throw new ConflictException('One or more EDV rows not found for batch');
    }

    const loadedIds = new Set(loaded.map((e) => e.id));
    for (const id of requestedIds) {
      if (!loadedIds.has(id)) {
        throw new ConflictException(`EDV ${id} not found for batch operation`);
      }
    }
  }

  /**
   * Validates batch transition plan before any write - all-or-nothing.
   */
  assertBatchTransitionPlan(
    loaded: readonly EdvWithDiscipline[],
    targetStatus: EdvStatus,
    allowedFromStatuses: readonly EdvStatus[],
  ): BatchTransitionPlan[] {
    const plan: BatchTransitionPlan[] = [];

    for (const edv of loaded) {
      const from = edv.status as EdvStatus;
      if (!allowedFromStatuses.includes(from)) {
        throw new ConflictException(
          `EDV ${edv.id} status ${from} cannot transition to ${targetStatus}`,
        );
      }
      if (from === EdvStatus.LOCKED) {
        throw new ConflictException(`EDV ${edv.id} is LOCKED and immutable`);
      }
      plan.push({ edvId: edv.id, from, to: targetStatus });
    }

    return plan;
  }

  /**
   * Package lock requires every item EDV to be APPROVED.
   */
  assertPackageLockEligible(
    edvStatuses: readonly EdvStatus[],
    packageId: string,
  ): void {
    if (edvStatuses.length === 0) {
      throw new ConflictException(
        `Design package ${packageId} has no EDV items to lock`,
      );
    }

    for (const status of edvStatuses) {
      if (status !== EdvStatus.APPROVED) {
        throw new ConflictException(
          `All EDVs must be APPROVED before lock on package ${packageId}`,
        );
      }
    }
  }
}
