// UI polish pass — styles only, no logic changes

'use client';

import { useEffect, useState } from 'react';
import { Drawer, Segmented } from 'antd';
import MainNavPanel from '@/components/ui/shell/MainNavPanel';
import ContextSidebar from '@/components/ui/shell/ContextSidebar';
import { RAIL_EXPANDED_WIDTH } from '@/components/ui/shell/shell-layout';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { tokens } from '@/lib/theme/tokens';

type MobileNavPane = 'app' | 'project';

/**
 * Unified mobile navigation drawer — app menu and project menu in one place.
 */
export default function MobileNavDrawer({
  open,
  onClose,
  showProjectNav,
  projectId,
  projectName,
}: {
  open: boolean;
  onClose: () => void;
  showProjectNav: boolean;
  projectId: string | null;
  projectName: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const [pane, setPane] = useState<MobileNavPane>('app');

  useEffect(() => {
    if (open && showProjectNav && projectId) {
      setPane('project');
      return;
    }
    setPane('app');
  }, [open, showProjectNav, projectId]);

  const showTabs = showProjectNav && projectId !== null;

  return (
    <Drawer
      placement="left"
      open={open}
      onClose={onClose}
      size={RAIL_EXPANDED_WIDTH}
      closable
      title={null}
      className="lg:hidden"
      styles={{
        body: {
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          background: tokens.colorCardBg,
        },
        header: { display: 'none' },
        content: {
          borderRight: `0.5px solid ${tokens.colorBorder}`,
        },
      }}
    >
      {showTabs && (
        <div
          className="shrink-0 bg-white px-3 py-3"
          style={{ borderBottom: `0.5px solid ${tokens.colorBorder}` }}
        >
          <Segmented<MobileNavPane>
            block
            value={pane}
            onChange={setPane}
            options={[
              { label: t('nav.menuApplication'), value: 'app' },
              { label: t('nav.menuProject'), value: 'project' },
            ]}
          />
        </div>
      )}

      <div className="min-h-0 flex-1">
        {pane === 'app' || !showTabs ? (
          <MainNavPanel isExpanded onNavigate={onClose} />
        ) : (
          <ContextSidebar
            projectId={projectId}
            projectName={projectName}
            onNavigate={onClose}
            className="h-full w-full border-r-0"
          />
        )}
      </div>
    </Drawer>
  );
}
