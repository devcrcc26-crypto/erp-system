'use client';

import FormLayout from '@/components/ui/FormLayout/FormLayout';
import type {
  DesignPackage,
  DesignPackageDependency,
  EngineeringDocument,
} from '@/lib/api/epc.types';
import { resolveEdvDisplayLabel } from '@/lib/utils/edv-display';

/**
 * Shows upstream package dependencies and frozen locked EDVs at session open.
 * Hidden when the package has no cross-package dependencies.
 */
export default function DependencySnapshotPanel({
  dependencies,
  packages,
  documents,
  snapshotEdvIds,
  contentHash,
}: {
  dependencies: readonly DesignPackageDependency[];
  packages: readonly DesignPackage[];
  documents: readonly EngineeringDocument[];
  snapshotEdvIds: readonly string[];
  contentHash: string | null | undefined;
}): React.ReactNode {
  if (dependencies.length === 0) {
    return null;
  }

  const packageNameById = new Map(packages.map((pkg) => [pkg.id, pkg.name]));

  return (
    <FormLayout
      title="Upstream dependencies"
      description="Cross-discipline subtasks this submission depends on."
    >
      <ul className="mb-4 divide-y divide-slate-100 rounded border border-slate-200">
        {dependencies.map((dependency) => (
          <li key={dependency.id} className="px-3 py-2 text-sm">
            <span className="font-medium text-slate-900">
              {dependency.dependsOnPackageName ??
                packageNameById.get(dependency.dependsOnPackageId) ??
                'Upstream subtask'}
            </span>
            <span className="ml-2 text-xs text-slate-500">
              {dependency.dependencyType.replace(/_/g, ' ')}
            </span>
          </li>
        ))}
      </ul>

      {contentHash && (
        <p className="mb-3 break-all text-xs text-slate-500">
          Snapshot hash:{' '}
          <code className="text-slate-700">{contentHash.slice(0, 16)}…</code>
        </p>
      )}

      {snapshotEdvIds.length === 0 ? (
        <p className="text-sm text-slate-500">
          No locked revisions from upstream subtasks were captured when this
          session opened. Upstream subtasks may still be in progress.
        </p>
      ) : (
        <div>
          <p className="mb-2 text-xs font-medium text-slate-600">
            Locked upstream revisions ({snapshotEdvIds.length})
          </p>
          <ul className="divide-y divide-slate-100 rounded border border-slate-200">
            {snapshotEdvIds.map((edvId) => (
              <li key={edvId} className="px-3 py-2 text-sm text-slate-800">
                {resolveEdvDisplayLabel(edvId, documents)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </FormLayout>
  );
}
