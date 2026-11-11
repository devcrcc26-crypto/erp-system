'use client';

import Link from 'next/link';
import { Tooltip } from 'antd';
import { ChevronRight } from 'lucide-react';
import SidebarBadge from '@/components/sidebar/SidebarBadge';
import type { SidebarLink } from '@/components/sidebar/sidebar-model';
import { getNavIcon } from '@/lib/navigation/nav-icons';
import { useCurrentUser } from '@/lib/query/profile';
import { useAuthStore } from '@/stores/auth.store';
import { formatUserName } from '@/lib/utils/user-display';

type TooltipSide = 'top' | 'right';

export interface SidebarModeToggleProps {
  icon: string;
  /** Accessible name; keep it constant when `pressed` conveys the state. */
  label: string;
  /** Visible tooltip text (defaults to `label`). */
  tooltip?: string;
  /** Toggle state for `aria-pressed` (e.g. sidebar pinned). */
  pressed?: boolean;
  onClick: () => void;
  tooltipPlacement?: TooltipSide;
}

interface FooterLinkState {
  readonly label: string;
  readonly active: boolean;
  readonly badgeCount: number;
  readonly badgeLabel: string;
}

/**
 * Sidebar footer. Utility links (Approvals, Audit Log, Settings, …) are icon
 * buttons; the link flagged `accountCard` (My Profile) is the account card.
 *
 * - Expanded: a row of icon buttons, then the card beside the collapse toggle.
 * - Compact: a vertical stack of icon buttons, an initials avatar for the
 *   account, then the expand toggle. Tooltips open to the right.
 *
 * Which links appear is decided by the config and permission filtering; this
 * component only lays them out.
 */
export default function SidebarFooter({
  links,
  account,
  stateFor,
  onNavigate,
  modeToggle,
  compact = false,
}: {
  /** Icon-bar links, in config order. */
  links: readonly SidebarLink[];
  /** The account-card link, or null when the session cannot see it. */
  account: SidebarLink | null;
  stateFor: (link: SidebarLink) => FooterLinkState;
  onNavigate?: () => void;
  /** Desktop only - the drawer has no collapsed mode. */
  modeToggle?: SidebarModeToggleProps;
  compact?: boolean;
}): React.ReactNode {
  if (links.length === 0 && account === null && !modeToggle) {
    return null;
  }

  if (compact) {
    return (
      <div className="sb-divider sb-footer sb-footer--compact shrink-0">
        {links.length > 0 ? (
          <ul className="sb-utility-stack">
            {links.map((link) => (
              <li key={link.id}>
                <UtilityButton
                  link={link}
                  state={stateFor(link)}
                  onNavigate={onNavigate}
                  tooltipSide="right"
                />
              </li>
            ))}
          </ul>
        ) : null}
        {account ? (
          <AccountAvatarLink
            link={account}
            state={stateFor(account)}
            onNavigate={onNavigate}
          />
        ) : null}
        {modeToggle ? (
          <SidebarModeToggle {...modeToggle} tooltipPlacement="right" />
        ) : null}
      </div>
    );
  }

  return (
    <div className="sb-divider sb-footer shrink-0">
      {links.length > 0 ? (
        <ul className="sb-utility-bar">
          {links.map((link) => (
            <li key={link.id}>
              <UtilityButton
                link={link}
                state={stateFor(link)}
                onNavigate={onNavigate}
              />
            </li>
          ))}
        </ul>
      ) : null}
      {account || modeToggle ? (
        <div className="sb-account-row">
          {account ? (
            <AccountCard
              link={account}
              state={stateFor(account)}
              onNavigate={onNavigate}
            />
          ) : (
            <span className="flex-1" />
          )}
          {modeToggle ? <SidebarModeToggle {...modeToggle} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function UtilityButton({
  link,
  state,
  onNavigate,
  tooltipSide = 'top',
}: {
  link: SidebarLink;
  state: FooterLinkState;
  onNavigate?: () => void;
  tooltipSide?: TooltipSide;
}): React.ReactNode {
  if (link.href === null) {
    return null;
  }
  // The span gives the tooltip a DOM anchor; focus bubbles to it, so the
  // label shows on keyboard focus as well as hover.
  const icon = (
    <>
      <span className="sb-icon">{getNavIcon(link.icon)}</span>
      <span className="sr-only">{state.label}</span>
      <SidebarBadge
        count={state.badgeCount}
        label={state.badgeLabel}
        floating
      />
    </>
  );

  return (
    <Tooltip
      title={state.label}
      placement={tooltipSide}
      trigger={['hover', 'focus']}
      mouseEnterDelay={0.3}
    >
      <span className="block">
        {link.openInNewTab ? (
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onNavigate}
            className="sb-selectable sb-utility-button"
          >
            {icon}
          </a>
        ) : (
          <Link
            href={link.href}
            onClick={onNavigate}
            aria-current={state.active ? 'page' : undefined}
            className="sb-selectable sb-utility-button"
          >
            {icon}
          </Link>
        )}
      </span>
    </Tooltip>
  );
}

/**
 * Signed-in user's display name, initials and second line for the account
 * card/avatar. The second line is the primary role from `/auth/me`, falling
 * back to the email while the profile loads or when no role is assigned.
 */
function useAccountIdentity(): {
  subtitle: string | null;
  name: string;
  initials: string;
} {
  const user = useAuthStore((s) => s.user);
  const { data: profile } = useCurrentUser();
  if (!user) {
    return { subtitle: null, name: '', initials: '' };
  }
  const name = formatUserName(user);
  const initials =
    `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase() ||
    user.email.charAt(0).toUpperCase();
  const roles = profile?.roles ?? [];
  const primaryRole = roles.find((role) => role.isPrimary) ?? roles[0];
  return {
    subtitle: primaryRole?.name || user.email || null,
    name,
    initials,
  };
}

function AccountCard({
  link,
  state,
  onNavigate,
}: {
  link: SidebarLink;
  state: FooterLinkState;
  onNavigate?: () => void;
}): React.ReactNode {
  const { subtitle, name, initials } = useAccountIdentity();
  if (link.href === null) {
    return null;
  }

  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      aria-current={state.active ? 'page' : undefined}
      className="sb-selectable sb-account-card"
    >
      <span className="sb-avatar" aria-hidden>
        {initials || getNavIcon(link.icon)}
      </span>
      <span className="sb-account-text">
        <span className="sb-account-name">{name || state.label}</span>
        {subtitle ? <span className="sb-account-meta">{subtitle}</span> : null}
      </span>
      {/* Visible text first (WCAG 2.5.3), then the destination. */}
      {name ? <span className="sr-only">{`, ${state.label}`}</span> : null}
      <ChevronRight
        aria-hidden
        size={16}
        strokeWidth={2}
        className="sb-account-chevron"
      />
    </Link>
  );
}

/** Compact rail: the account as an initials avatar with a hover/focus tooltip. */
function AccountAvatarLink({
  link,
  state,
  onNavigate,
}: {
  link: SidebarLink;
  state: FooterLinkState;
  onNavigate?: () => void;
}): React.ReactNode {
  const { name, initials } = useAccountIdentity();
  if (link.href === null) {
    return null;
  }
  const tooltip = name ? `${name} · ${state.label}` : state.label;

  return (
    <Tooltip
      title={tooltip}
      placement="right"
      trigger={['hover', 'focus']}
      mouseEnterDelay={0.3}
    >
      <span className="block w-full">
        <Link
          href={link.href}
          onClick={onNavigate}
          aria-current={state.active ? 'page' : undefined}
          className="sb-selectable sb-account-avatar-link"
        >
          <span className="sb-avatar" aria-hidden>
            {initials || getNavIcon(link.icon)}
          </span>
          <span className="sr-only">{tooltip}</span>
        </Link>
      </span>
    </Tooltip>
  );
}

/** Square icon button that collapses or expands the sidebar. */
function SidebarModeToggle({
  icon,
  label,
  tooltip,
  pressed,
  onClick,
  tooltipPlacement = 'top',
}: SidebarModeToggleProps): React.ReactNode {
  return (
    <Tooltip
      title={tooltip ?? label}
      placement={tooltipPlacement}
      trigger={['hover', 'focus']}
      mouseEnterDelay={0.3}
    >
      <button
        type="button"
        className="sb-mode-toggle"
        aria-label={label}
        aria-pressed={pressed}
        onClick={onClick}
      >
        <span className="sb-icon">{getNavIcon(icon)}</span>
      </button>
    </Tooltip>
  );
}
