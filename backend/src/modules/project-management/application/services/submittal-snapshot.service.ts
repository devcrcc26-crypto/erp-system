import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { PrismaTx } from '../../infrastructure/repositories/epc-workflow.repository';

export interface SubmittalEdvSnapshotRow {
  readonly engineeringDocumentVersionId: string;
  readonly engineeringDocumentId: string;
  readonly revisionLabel: string;
  readonly documentNumber: string | null;
  readonly title: string;
  readonly edvStatus: string;
}

export interface SubmittalPackageSnapshot {
  readonly designPackageId: string;
  readonly snapshotEdvIds: readonly string[];
  readonly snapshotPayload: readonly SubmittalEdvSnapshotRow[];
  readonly contentHash: string;
}

/**
 * Builds immutable submittal item snapshots from live package EDVs at issue time.
 */
@Injectable()
export class SubmittalSnapshotService {
  /**
   * Captures frozen EDV identity rows for a design package.
   */
  async buildPackageSnapshot(
    tx: PrismaTx,
    companyId: string,
    designPackageId: string,
    excludedEdvIds: readonly string[] = [],
  ): Promise<SubmittalPackageSnapshot> {
    const excluded = new Set(excludedEdvIds);
    const items = await tx.designPackageItem.findMany({
      where: { companyId, designPackageId },
      orderBy: { sortOrder: 'asc' },
      include: {
        engineeringDocumentVersion: {
          include: { engineeringDocument: true },
        },
      },
    });

    const snapshotPayload: SubmittalEdvSnapshotRow[] = items
      .map((item) => {
        const edv = item.engineeringDocumentVersion;
        const doc = edv.engineeringDocument;
        return {
          engineeringDocumentVersionId: edv.id,
          engineeringDocumentId: doc.id,
          revisionLabel: edv.revisionLabel,
          documentNumber: doc.documentNumber,
          title: doc.title,
          edvStatus: edv.status,
        };
      })
      .filter((row) => !excluded.has(row.engineeringDocumentVersionId));

    const snapshotEdvIds = snapshotPayload
      .map((r) => r.engineeringDocumentVersionId)
      .sort();
    const contentHash = createHash('sha256')
      .update(JSON.stringify(snapshotPayload))
      .digest('hex');

    return {
      designPackageId,
      snapshotEdvIds,
      snapshotPayload,
      contentHash,
    };
  }
}
