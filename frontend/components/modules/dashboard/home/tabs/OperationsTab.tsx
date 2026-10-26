'use client';

import AnnouncementsWidget from '../AnnouncementsWidget';
import OperationalStatsWidgets from '../OperationalStatsWidgets';

/**
 * HR "Operations": announcements plus the operational cards. Contracts are
 * deliberately excluded - they live only on the Overview tab.
 */
export default function OperationsTab({ enabled }: { enabled: boolean }): React.ReactNode {
  return (
    <>
      <AnnouncementsWidget enabled={enabled} />
      <div className="dv2-grid">
        <OperationalStatsWidgets enabled={enabled} variant="operations" />
      </div>
    </>
  );
}
