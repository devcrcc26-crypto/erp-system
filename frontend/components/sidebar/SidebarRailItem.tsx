'use client';

import Link from 'next/link';
import { Tooltip } from 'antd';
import { ChevronRight } from 'lucide-react';
import SidebarBadge from '@/components/sidebar/SidebarBadge';
import { getNavIcon } from '@/lib/navigation/nav-icons';

interface RailItemBase {
  icon: string;
  label: string;
  /** Compact rail: one-line caption when `label` is too long to fit. */
  caption?: string;
  /** Compact rail: icon over a caption, full label in a hover/focus tooltip. */
  compact: boolean;
  /** Current page lives here (link) or inside this closed folder. */
  active: boolean;
  badgeCount?: number;
  badgeLabel?: string;
}

interface RailLinkProps extends RailItemBase {
  kind: 'link';
  href: string;
  onNavigate?: () => void;
}

interface RailFolderProps extends RailItemBase {
  kind: 'folder';
  open: boolean;
  /** Id of the panel this folder shows and hides. */
  controlsId: string;
  onToggle: () => void;
  /** DOM id — lets the shell return focus here when a panel closes. */
  buttonId?: string;
}

interface RailActionProps extends RailItemBase {
  kind: 'action';
  onClick: () => void;
  /** e.g. "Control+K" — exposed via aria-keyshortcuts. */
  keyShortcuts?: string;
  buttonId?: string;
}

export type SidebarRailItemProps = RailLinkProps | RailFolderProps | RailActionProps;

/**
 * One top-level sidebar entry. Links navigate; folders are disclosure buttons
 * with a chevron, `aria-expanded` and `aria-haspopup` so they never look or
 * sound like links.
 */
export default function SidebarRailItem(props: SidebarRailItemProps): React.ReactNode {
  const { icon, label, caption, compact, active, badgeCount = 0, badgeLabel = '' } = props;
  const className = `sb-selectable ${compact ? 'sb-tile' : 'sb-row'}`;
  const isFolder = props.kind === 'folder';
  const shortCaption = caption && caption !== label ? caption : null;

  const content = (
    <>
      <span className="sb-icon">{getNavIcon(icon)}</span>
      {compact ? (
        <span className="sb-tile-caption">
          {shortCaption ? (
            <>
              {/* Name keeps the visible caption first (WCAG 2.5.3), then the full label. */}
              <span aria-hidden>{shortCaption}</span>
              <span className="sr-only">{`${shortCaption}, ${label}`}</span>
            </>
          ) : (
            label
          )}
        </span>
      ) : (
        <span className="sb-row-label">{label}</span>
      )}
      <SidebarBadge count={badgeCount} label={badgeLabel} floating={compact} />
      {isFolder && !compact ? (
        <span className="sb-chevron" aria-hidden>
          <ChevronRight size={16} strokeWidth={2} />
        </span>
      ) : null}
      {isFolder && compact ? (
        <span className="sb-tile-folder-mark" aria-hidden>
          <ChevronRight size={12} strokeWidth={2.25} />
        </span>
      ) : null}
    </>
  );

  let control: React.ReactElement;
  if (props.kind === 'link') {
    control = (
      <Link
        href={props.href}
        onClick={props.onNavigate}
        aria-current={active ? 'page' : undefined}
        className={className}
      >
        {content}
      </Link>
    );
  } else if (props.kind === 'folder') {
    control = (
      <button
        id={props.buttonId}
        type="button"
        className={className}
        aria-expanded={props.open}
        aria-haspopup="true"
        aria-controls={props.controlsId}
        data-active={active && !props.open ? 'true' : undefined}
        onClick={props.onToggle}
      >
        {content}
      </button>
    );
  } else {
    control = (
      <button
        id={props.buttonId}
        type="button"
        className={className}
        aria-keyshortcuts={props.keyShortcuts}
        onClick={props.onClick}
      >
        {content}
      </button>
    );
  }

  if (!compact) {
    return control;
  }

  // The span gives the tooltip a DOM anchor; focus events bubble to it from
  // the control, so the tooltip opens on keyboard focus as well as hover.
  return (
    <Tooltip
      title={label}
      placement="right"
      trigger={['hover', 'focus']}
      mouseEnterDelay={0.3}
    >
      <span className="block">{control}</span>
    </Tooltip>
  );
}
