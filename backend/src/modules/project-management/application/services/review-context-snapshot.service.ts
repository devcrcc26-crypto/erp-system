import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { DesignPackageDependencyType } from '@prisma/client';
import { EpcReviewRepository } from '../../infrastructure/repositories/epc-review.repository';
import { PrismaTx } from '../../infrastructure/repositories/epc-workflow.repository';

export interface FrozenReviewContext {
  readonly referencedVersionIds: readonly string[];
  readonly contentHash: string;
}

/**
 * Builds immutable ReviewContextSnapshot payloads at session open.
 */
@Injectable()
export class ReviewContextSnapshotService {
  constructor(private readonly epcReviewRepository: EpcReviewRepository) {}

  /**
   * Collects dependency EDV UUIDs and computes integrity hash.
   */
  async buildFrozenContext(
    tx: PrismaTx,
    companyId: string,
    designPackageId: string,
  ): Promise<FrozenReviewContext> {
    const deps = await this.epcReviewRepository.findPackageDependencies(
      tx,
      companyId,
      designPackageId,
    );

    const referencedIds = new Set<string>();

    for (const dep of deps) {
      if (
        dep.dependencyType === DesignPackageDependencyType.FINISH_TO_START ||
        dep.dependencyType === DesignPackageDependencyType.COORDINATION_ONLY
      ) {
        const lockedIds = await this.epcReviewRepository.findLockedEdvIdsForPackage(
          tx,
          companyId,
          dep.dependsOnPackageId,
        );
        for (const id of lockedIds) {
          referencedIds.add(id);
        }
      }
    }

    const referencedVersionIds = [...referencedIds].sort();
    const contentHash = createHash('sha256')
      .update(referencedVersionIds.join(','))
      .digest('hex');

    return { referencedVersionIds, contentHash };
  }
}
